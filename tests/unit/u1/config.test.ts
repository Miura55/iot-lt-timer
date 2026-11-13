import { describe, expect, it, vi } from 'vitest';
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane';
import type { IoTClient } from '@aws-sdk/client-iot';
import { createIotCommandTopic, loadConfig } from '../../../apps/api/src/config.js';
import { createIotDataPlaneClientProvider } from '../../../apps/api/src/iot-endpoint.js';

describe('U1 IoT configuration', () => {
  it('discovers the account endpoint once and builds an HTTPS data client', async () => {
    const send = vi.fn().mockResolvedValue({
      endpointAddress: 'a1b2c3-ats.iot.ap-northeast-1.amazonaws.com',
    });
    const getClient = createIotDataPlaneClientProvider({ send } as unknown as IoTClient);

    const first = await getClient();
    const second = await getClient();
    expect(first).toBe(second);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ input: { endpointType: 'iot:Data-ATS' } });
    await expect(first.config.endpoint()).resolves.toMatchObject({
      protocol: 'https:',
      hostname: 'a1b2c3-ats.iot.ap-northeast-1.amazonaws.com',
    });
    first.destroy();
  });

  it('allows a failed discovery to be retried', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ endpointAddress: 'a1b2c3-ats.iot.ap-northeast-1.amazonaws.com' });
    const getClient = createIotDataPlaneClientProvider({ send } as unknown as IoTClient);

    await expect(getClient()).rejects.toThrow('temporary');
    await expect(getClient()).resolves.toBeInstanceOf(IoTDataPlaneClient);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses the environment and bell identifier in the commands topic', () => {
    expect(createIotCommandTopic('dev', 'bell-1')).toBe('lt-timer/v1/dev/bells/bell-1/commands');
    expect(() => createIotCommandTopic('prod', 'bell/#')).toThrow('BELL_ID');
  });

  it('does not require an IoT endpoint in runtime configuration', () => {
    const config = loadConfig({
      TABLE_NAME: 'timer',
      VENUE_ID: 'venue-1',
      BELL_ID: 'bell-1',
      ENVIRONMENT: 'dev',
      USER_POOL_ID: 'pool',
      USER_POOL_CLIENT_ID: 'client',
    } as NodeJS.ProcessEnv);
    expect(config.bellId).toBe('bell-1');
  });
});
