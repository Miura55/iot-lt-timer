import { afterEach, describe, expect, it, vi } from 'vitest';
import { operationEvent } from '../../../apps/api/src/timer/observability.js';

describe('U2 operation observability', () => {
  afterEach(() => vi.restoreAllMocks());
  it('writes a JSON state event with correlation fields and no caller identity', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    operationEvent({ event: 'timer-control-committed', operation: 'pause', result: 'accepted', sessionId: 'session', operationKey: 'key', version: 2, generation: 1, requestId: 'request', timestamp: new Date('2026-11-14T10:00:00Z') });
    const event = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(event).toMatchObject({ event: 'timer-control-committed', sessionId: 'session', operationKey: 'key', requestId: 'request', version: 2, generation: 1 });
    expect(event).not.toHaveProperty('principalId');
  });
  it('emits a control-accepted embedded metric with bounded dimensions', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    operationEvent({ event: 'committed', operation: 'resume', result: 'accepted' });
    const metric = JSON.parse(String(log.mock.calls[1]?.[0]));
    expect(metric.ResumeAccepted).toBeUndefined();
    expect(metric.ControlAccepted).toBe(1);
    expect(metric._aws.CloudWatchMetrics[0].Dimensions).toEqual([['Environment', 'Operation', 'Result']]);
  });
  it.each([
    ['conflict', 'ControlConflict'], ['forbidden', 'ControlForbidden'], ['rejected', 'ControlRejected'], ['recovered', 'OperationLeaseRecovered'],
    ['pending', 'OperationLeasePending'], ['repaired', 'WakeRepair'], ['unknown', 'NotificationUnknown'],
  ] as const)('maps result %s to metric %s', (result, metricName) => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    operationEvent({ event: 'observed', operation: result === 'unknown' ? 'notification' : result === 'repaired' || result === 'recovered' || result === 'pending' ? 'reconcile' : 'cancel', result });
    expect(JSON.parse(String(log.mock.calls[1]?.[0]))[metricName]).toBe(1);
  });
});
