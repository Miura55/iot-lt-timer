import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { TimerRepository } from './repository.js';
import type { StepFunctionsWakeRegistrar } from './wake-registrar.js';
export declare function createHttpHandler(repository: TimerRepository, registrar: StepFunctionsWakeRegistrar, venueId: string, authConfig: {
    userPoolId: string;
    userPoolClientId: string;
}): APIGatewayProxyHandlerV2;
export declare function principalFromEvent(event: APIGatewayProxyEventV2): string | undefined;
