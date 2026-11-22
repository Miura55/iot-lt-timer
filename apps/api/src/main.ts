import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SFNClient } from '@aws-sdk/client-sfn';
import { createIotCommandTopic, loadConfig } from './config.js';
import { DynamoTimerRepository } from './timer/dynamo-repository.js';
import { StepFunctionsWakeRegistrar } from './timer/wake-registrar.js';
import { createHttpHandler } from './timer/http-handler.js';
import { AwsIotBellPublisher, createDispatcher } from './timer/dispatcher.js';
import { createReconciler } from './timer/reconciler.js';
import { createIotDataPlaneClientProvider } from './iot-endpoint.js';

const config = loadConfig();
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const repository = new DynamoTimerRepository(db, config.tableName);
const registrar = new StepFunctionsWakeRegistrar(
  new SFNClient({}),
  config.stateMachineArn ?? '',
  repository,
);

export const api = createHttpHandler(repository, registrar, config.venueId, {
  userPoolId: config.userPoolId,
  userPoolClientId: config.userPoolClientId,
});

const topic = createIotCommandTopic(config.environment, config.bellId);
console.info(
  JSON.stringify({
    event: 'timer-iot-publisher-configured',
    environment: config.environment,
    topic,
  }),
);
export const dispatch = createDispatcher(
  repository,
  new AwsIotBellPublisher(createIotDataPlaneClientProvider()),
  { venueId: config.venueId, topic },
);
export const reconcile = createReconciler(repository, registrar, dispatch);
