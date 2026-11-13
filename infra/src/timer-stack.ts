import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface TimerStackProps extends StackProps {
  environmentName: 'dev' | 'prod';
}

export class TimerStack extends Stack {
  constructor(scope: Construct, id: string, props: TimerStackProps) {
    super(scope, id, props);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const table = new dynamodb.Table(this, 'TimerState', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: props.environmentName === 'prod',
      timeToLiveAttribute: 'expiresAt',
      removalPolicy:
        props.environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'WakeIndex',
      partitionKey: { name: 'wakePartition', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'wakeDueAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['sessionId', 'notificationId', 'entity'],
    });
    table.addGlobalSecondaryIndex({
      indexName: 'RecoveryIndex',
      partitionKey: { name: 'recoveryPartition', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recoveryDueAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['sessionId', 'notificationId', 'entity'],
    });
    const pool = new cognito.UserPool(this, 'OperatorUsers', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 12, requireDigits: true, requireSymbols: true },
      removalPolicy:
        props.environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const client = pool.addClient('WebClient', {
      authFlows: { userPassword: true, userSrp: true },
      preventUserExistenceErrors: true,
    });
    const api = new apigwv2.HttpApi(this, 'TimerApi', {
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        allowHeaders: ['authorization', 'content-type', 'idempotency-key'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        maxAge: Duration.hours(1),
      },
    });
    const apiFunction = this.nodeFunction(
      'ApiHandler',
      root,
      'src/main.api',
      table,
      pool,
      client,
      props.environmentName,
    );
    const dispatchFunction = this.nodeFunction(
      'DispatchHandler',
      root,
      'src/main.dispatch',
      table,
      pool,
      client,
      props.environmentName,
    );
    const reconcileFunction = this.nodeFunction(
      'ReconcileHandler',
      root,
      'src/main.reconcile',
      table,
      pool,
      client,
      props.environmentName,
    );
    table.grantReadWriteData(apiFunction);
    table.grantReadWriteData(dispatchFunction);
    table.grantReadWriteData(reconcileFunction);
    dispatchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iot:Publish'],
        resources: [
          `arn:${this.partition}:iot:${this.region}:${this.account}:topic/lt-timer/v1/${props.environmentName}/bells/*/commands`,
        ],
      }),
    );
    const stateMachine = new sfn.StateMachine(this, 'TimerWakeStateMachine', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(
        new sfn.Wait(this, 'WaitUntilDue', {
          time: sfn.WaitTime.timestampPath('$.scheduledAt'),
        }).next(
          new tasks.LambdaInvoke(this, 'InvokeTimerWorker', {
            lambdaFunction: dispatchFunction,
            payloadResponseOnly: true,
          }),
        ),
      ),
      timeout: Duration.days(365),
    });
    stateMachine.grantStartExecution(apiFunction);
    stateMachine.grantStartExecution(reconcileFunction);
    reconcileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['states:ListExecutions'],
        resources: [stateMachine.stateMachineArn],
      }),
    );
    apiFunction.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);
    reconcileFunction.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.${this.region}.${this.urlSuffix}/${pool.userPoolId}`,
      { jwtAudience: [client.userPoolClientId] },
    );
    api.addRoutes({
      path: '/v1/config',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('GetRuntimeConfig', apiFunction),
    });
    api.addRoutes({
      path: '/v1/state',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('GetState', apiFunction),
      authorizer: jwtAuthorizer,
    });
    api.addRoutes({
      path: '/v1/sessions',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('StartSession', apiFunction),
      authorizer: jwtAuthorizer,
    });
    for (const action of ['pause', 'resume', 'cancel'] as const)
      api.addRoutes({
        path: `/v1/sessions/{sessionId}/${action}`,
        methods: [apigwv2.HttpMethod.POST],
        integration: new integrations.HttpLambdaIntegration(`${action}Session`, apiFunction),
        authorizer: jwtAuthorizer,
      });
    new events.Rule(this, 'MinuteReconciliation', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(reconcileFunction)],
    });
    const dashboard = new cloudwatch.Dashboard(this, 'TimerOperationsDashboard', {
      dashboardName: `iot-lt-timer-${props.environmentName}`,
    });
    const metric = (metricName: string, operation: string, result: string) =>
      new cloudwatch.Metric({
        namespace: 'IoTLtTimer/U2',
        metricName,
        dimensionsMap: { Environment: props.environmentName, Operation: operation, Result: result },
        statistic: 'sum',
        period: Duration.minutes(1),
      });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Timer control and recovery events',
        left: [
          ...(['pause', 'resume', 'cancel'] as const).map((operation) =>
            metric('ControlAccepted', operation, 'accepted'),
          ),
          ...(['pause', 'resume', 'cancel'] as const).map((operation) =>
            metric('ControlConflict', operation, 'conflict'),
          ),
          ...(['pause', 'resume', 'cancel'] as const).map((operation) =>
            metric('ControlRejected', operation, 'rejected'),
          ),
          ...(['pause', 'resume', 'cancel'] as const).map((operation) =>
            metric('ControlForbidden', operation, 'forbidden'),
          ),
          metric('OperationLeaseRecovered', 'reconcile', 'recovered'),
          metric('OperationLeasePending', 'reconcile', 'pending'),
          metric('WakeRepair', 'reconcile', 'repaired'),
          metric('NotificationUnknown', 'notification', 'unknown'),
        ],
      }),
    );
    const apiErrorAlarm = apiFunction
      .metricErrors({ period: Duration.minutes(5), statistic: 'sum' })
      .createAlarm(this, 'ApiErrorsAlarm', {
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'Repeated API handler errors; check U2 operation logs.',
      });
    const reconcileErrorAlarm = reconcileFunction
      .metricErrors({ period: Duration.minutes(5), statistic: 'sum' })
      .createAlarm(this, 'ReconcileErrorsAlarm', {
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: 'Timer recovery reconciliation failed.',
      });
    void apiErrorAlarm;
    void reconcileErrorAlarm;
    const bucket = new s3.Bucket(this, 'WebAssets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy:
        props.environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environmentName !== 'prod',
    });
    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        'v1/*': {
          origin: new origins.HttpOrigin(
            api.apiId + '.execute-api.' + this.region + '.' + this.urlSuffix,
          ),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    });
    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(path.join(root, 'apps/web/dist'))],
    });
    new budgets.CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName: `iot-lt-timer-${props.environmentName}`,
        budgetLimit: { amount: 500, unit: 'JPY' },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
    });
    this.exportValue(api.apiEndpoint, { name: `ApiEndpoint-${props.environmentName}` });
    this.exportValue(distribution.distributionDomainName, {
      name: `WebUrl-${props.environmentName}`,
    });
    this.exportValue(pool.userPoolId, { name: `UserPoolId-${props.environmentName}` });
    this.exportValue(client.userPoolClientId, {
      name: `UserPoolClientId-${props.environmentName}`,
    });
  }

  private nodeFunction(
    id: string,
    root: string,
    handler: string,
    table: dynamodb.Table,
    pool: cognito.UserPool,
    client: cognito.UserPoolClient,
    environmentName: string,
  ) {
    const fn = new nodejs.NodejsFunction(this, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(root, 'apps/api/src/main.ts'),
      handler: handler.split('.').at(-1)!,
      bundling: { externalModules: [], target: 'node22', sourceMap: true },
      timeout: Duration.seconds(10),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        TABLE_NAME: table.tableName,
        VENUE_ID: 'venue-default',
        ENVIRONMENT: environmentName,
        IOT_ENDPOINT:
          this.node.tryGetContext('iotEndpoint') ?? 'invalid.iot.ap-northeast-1.amazonaws.com',
        BELL_ID: this.node.tryGetContext('bellId') ?? 'bell-1',
        USER_POOL_ID: pool.userPoolId,
        USER_POOL_CLIENT_ID: client.userPoolClientId,
      },
    });
    return fn;
  }
}
