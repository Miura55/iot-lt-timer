export interface AppConfig {
  tableName: string;
  venueId: string;
  stateMachineArn?: string;
  bellId: string;
  environment: 'dev' | 'prod';
  userPoolId: string;
  userPoolClientId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = [
    'TABLE_NAME',
    'VENUE_ID',
    'BELL_ID',
    'USER_POOL_ID',
    'USER_POOL_CLIENT_ID',
  ] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const environment = env.ENVIRONMENT ?? 'dev';
  if (environment !== 'dev' && environment !== 'prod')
    throw new Error('ENVIRONMENT must be dev or prod');
  return {
    tableName: env.TABLE_NAME!,
    venueId: env.VENUE_ID!,
    stateMachineArn: env.STATE_MACHINE_ARN,
    bellId: env.BELL_ID!,
    environment,
    userPoolId: env.USER_POOL_ID!,
    userPoolClientId: env.USER_POOL_CLIENT_ID!,
  };
}

export function createIotCommandTopic(environment: AppConfig['environment'], bellId: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(bellId)) throw new Error('BELL_ID is invalid');
  return `lt-timer/v1/${environment}/bells/${bellId}/commands`;
}
