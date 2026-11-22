import { App } from 'aws-cdk-lib';
import { TimerStack } from './timer-stack.js';

const app = new App();
const environmentName = app.node.tryGetContext('environment') ?? 'dev';
new TimerStack(app, `IotLtTimer${environmentName[0]!.toUpperCase()}${environmentName.slice(1)}`, {
  environmentName,
});
