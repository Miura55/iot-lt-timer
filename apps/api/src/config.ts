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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = ['TABLE_NAME', 'VENUE_ID', 'IOT_ENDPOINT', 'BELL_ID', 'USER_POOL_ID', 'USER_POOL_CLIENT_ID'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const environment = env.ENVIRONMENT ?? 'dev';
  if (environment !== 'dev' && environment !== 'prod') throw new Error('ENVIRONMENT must be dev or prod');
  return {
    tableName: env.TABLE_NAME!, venueId: env.VENUE_ID!, stateMachineArn: env.STATE_MACHINE_ARN,
    iotEndpoint: env.IOT_ENDPOINT!, bellId: env.BELL_ID!, environment, userPoolId: env.USER_POOL_ID!, userPoolClientId: env.USER_POOL_CLIENT_ID!,
  };
}
