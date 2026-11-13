import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../apps/api/src/config.js';

const validEnvironment = {
  TABLE_NAME: 'timer-table',
  VENUE_ID: 'venue-1',
  IOT_ENDPOINT: 'https://iot.example.com',
  BELL_ID: 'bell-1',
  USER_POOL_ID: 'pool-1',
  USER_POOL_CLIENT_ID: 'client-1',
};

describe('API configuration', () => {
  it('loads required settings and defaults to dev', () => {
    expect(loadConfig(validEnvironment)).toEqual({
      tableName: 'timer-table',
      venueId: 'venue-1',
      stateMachineArn: undefined,
      iotEndpoint: 'https://iot.example.com',
      bellId: 'bell-1',
      environment: 'dev',
      userPoolId: 'pool-1',
      userPoolClientId: 'client-1',
    });
  });

  it('accepts the prod environment and state machine ARN', () => {
    expect(
      loadConfig({ ...validEnvironment, ENVIRONMENT: 'prod', STATE_MACHINE_ARN: 'arn:state' }),
    ).toMatchObject({ environment: 'prod', stateMachineArn: 'arn:state' });
  });

  it('reports missing required settings and rejects unknown environments', () => {
    expect(() => loadConfig({})).toThrow('Missing environment variables: TABLE_NAME');
    expect(() => loadConfig({ ...validEnvironment, ENVIRONMENT: 'test' })).toThrow(
      'ENVIRONMENT must be dev or prod',
    );
  });
});
