export interface AppConfig {
    tableName: string;
    venueId: string;
    stateMachineArn?: string;
    iotEndpoint: string;
    bellId: string;
    environment: 'dev' | 'prod';
    userPoolId: string;
    userPoolClientId: string;
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
