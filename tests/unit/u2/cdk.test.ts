import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { TimerStack } from '../../../infra/src/timer-stack.js';

const template = () =>
  Template.fromStack(
    new TimerStack(new App(), 'U2Test', {
      environmentName: 'dev',
      env: { account: '111111111111', region: 'ap-northeast-1' },
    }),
  );
const synthesized = template();

describe('U2 CDK assertions', () => {
  it('adds pause, resume and cancel routes behind the JWT authorizer', () => {
    const routes = synthesized.findResources('AWS::ApiGatewayV2::Route');
    for (const action of ['pause', 'resume', 'cancel']) {
      const route = Object.values(routes).find(
        (resource) => resource.Properties?.RouteKey === `POST /v1/sessions/{sessionId}/${action}`,
      );
      expect(route?.Properties?.AuthorizationType).toBe('JWT');
      expect(route?.Properties?.AuthorizationScopes).toBeUndefined();
    }
  });
  it('reuses the existing timer table and RecoveryIndex with no speculative index', () => {
    synthesized.resourceCountIs('AWS::DynamoDB::Table', 1);
    const table = Object.values(synthesized.findResources('AWS::DynamoDB::Table'))[0];
    expect(
      table.Properties?.GlobalSecondaryIndexes.map(
        (index: { IndexName: string }) => index.IndexName,
      ),
    ).toEqual(['WakeIndex', 'RecoveryIndex']);
    expect(table.Properties?.TimeToLiveSpecification.AttributeName).toBe('expiresAt');
  });
  it('retains the one minute recovery schedule and a single shared state machine', () => {
    synthesized.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    synthesized.resourceCountIs('AWS::Events::Rule', 1);
    const schedule = Object.values(synthesized.findResources('AWS::Events::Rule'))[0];
    expect(schedule.Properties?.ScheduleExpression).toBe('rate(1 minute)');
  });
  it('does not grant broad IoT publish access to the API handler', () => {
    const statements = Object.values(synthesized.findResources('AWS::IAM::Policy')).flatMap(
      (policy) => policy.Properties?.PolicyDocument.Statement ?? [],
    );
    const iot = statements.filter((statement: { Action?: string | string[] }) =>
      (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes(
        'iot:Publish',
      ),
    );
    expect(iot).toHaveLength(1);
    expect(JSON.stringify(iot[0].Resource)).toContain('topic/lt-timer/v1/dev/bells/*/commands');
  });
  it('adds the shared operations dashboard and server-side failure alarms', () => {
    synthesized.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    synthesized.resourceCountIs('AWS::CloudWatch::Alarm', 2);
    const dashboard = Object.values(synthesized.findResources('AWS::CloudWatch::Dashboard'))[0];
    expect(JSON.stringify(dashboard.Properties?.DashboardBody)).toContain('IoTLtTimer/U2');
  });
});
