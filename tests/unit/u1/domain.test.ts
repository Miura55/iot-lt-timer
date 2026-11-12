import { describe, expect, it } from 'vitest';
import { canPublish, computeDeadline, createNotificationTimes, createRingCommand, deterministicWake, mergeDispatchOutcome, recoveryTarget, terminalNotificationStatus, validateSettings } from '../../../packages/domain/src/index.js';

describe('U1 domain rules', () => {
  it('accepts a duration at the supported boundary and all ring counts', () => {
    expect(validateSettings({ durationSeconds: 1, bells: [] })).toEqual({ durationSeconds: 1, bells: [] });
    expect(validateSettings({ durationSeconds: 10_800, bells: [{ remainingSeconds: 10_800, ringCount: 1 }, { remainingSeconds: 5, ringCount: 2 }, { remainingSeconds: 0, ringCount: 3 }] }).bells).toHaveLength(3);
  });
  it('rejects invalid duration values', () => {
    for (const durationSeconds of [0, -1, 1.2, 10_801, '300']) expect(() => validateSettings({ durationSeconds, bells: [] })).toThrow();
  });
  it('rejects more than ten notifications', () => {
    expect(() => validateSettings({ durationSeconds: 100, bells: Array.from({ length: 11 }, (_, i) => ({ remainingSeconds: 80 - i * 2, ringCount: 1 })) })).toThrow('INVALID_BELLS');
  });
  it('rejects duplicate or too-close points and invalid ring counts', () => {
    expect(() => validateSettings({ durationSeconds: 20, bells: [{ remainingSeconds: 10, ringCount: 1 }, { remainingSeconds: 10, ringCount: 2 }] })).toThrow('BELL_INTERVAL_TOO_SHORT');
    expect(() => validateSettings({ durationSeconds: 20, bells: [{ remainingSeconds: 10, ringCount: 4 }] })).toThrow('INVALID_RING_COUNT');
  });
  it('calculates UTC deadline and notification expiry exactly five seconds after schedule', () => {
    const deadline = computeDeadline(new Date('2026-11-14T10:00:00.000Z'), 600);
    const notification = createNotificationTimes({ durationSeconds: 600, bells: [{ remainingSeconds: 0, ringCount: 3 }, { remainingSeconds: 600, ringCount: 1 }] }, deadline);
    expect(notification.map((n) => n.scheduledAt)).toEqual(['2026-11-14T10:00:00.000Z', '2026-11-14T10:10:00.000Z']);
    expect(Date.parse(notification[1]!.expiresAt) - Date.parse(notification[1]!.scheduledAt)).toBe(5_000);
  });
  it('uses recovery objective for zero and nonzero notification cases', () => {
    const deadline = new Date('2026-11-14T10:00:00.000Z');
    expect(recoveryTarget(deadline, []).toISOString()).toBe('2026-11-14T10:01:05.000Z');
    expect(recoveryTarget(deadline, [new Date('2026-11-14T10:00:05.000Z')]).toISOString()).toBe('2026-11-14T10:01:10.000Z');
  });
  it('only publishes within the half-open scheduled window', () => {
    const scheduled = new Date('2026-11-14T10:00:00.000Z');
    const expires = new Date('2026-11-14T10:00:05.000Z');
    expect(canPublish(new Date(scheduled.getTime() - 1), scheduled, expires)).toBe(false);
    expect(canPublish(scheduled, scheduled, expires)).toBe(true);
    expect(canPublish(expires, scheduled, expires)).toBe(false);
  });
  it('creates stable 500ms bell commands and merges outcomes by evidence strength', () => {
    const input = { id: 'notif-1', sessionId: 'session-1', ringCount: 3 as const, scheduledAt: '2026-11-14T10:00:00.000Z', expiresAt: '2026-11-14T10:00:05.000Z' };
    expect(createRingCommand(input)).toMatchObject({ commandId: 'notif-1', ringCount: 3, intervalMs: 500, expiresAtMs: 1794650405000 });
    expect(mergeDispatchOutcome('ambiguous', 'rejected')).toBe('ambiguous');
    expect(terminalNotificationStatus('ambiguous', true)).toBe('unknown');
  });
  it('uses same deterministic wake name and input for retry with same attempt', () => {
    const wakeInput = { targetId: 'session-1', generation: 1, deadline: '2026-11-14T10:00:00Z' };
    const first = deterministicWake('session-1', 1, 'deadline', 2, wakeInput);
    expect(deterministicWake('session-1', 1, 'deadline', 2, wakeInput)).toEqual(first);
    expect(deterministicWake('session-1', 1, 'deadline', 3, wakeInput).executionName).not.toBe(first.executionName);
  });
});
