import { describe, expect, it } from 'vitest';
import {
  applyControlTransition,
  type Notification,
  type TimerSession,
} from '../../../packages/domain/src/index.js';

function makeSession(overrides: Partial<TimerSession> = {}): TimerSession {
  const notifications: Notification[] = [
    {
      id: 'pending',
      remainingSeconds: 30,
      ringCount: 1,
      scheduledAt: '2026-11-14T10:00:30.000Z',
      expiresAt: '2026-11-14T10:00:35.000Z',
      status: 'pending',
      dispatchOutcome: 'not_attempted',
      attemptCount: 0,
      generation: 1,
      wake: { status: 'registered', attempt: 1 },
    },
    {
      id: 'sent',
      remainingSeconds: 60,
      ringCount: 3,
      scheduledAt: '2026-11-14T10:00:00.000Z',
      expiresAt: '2026-11-14T10:00:05.000Z',
      status: 'sent',
      dispatchOutcome: 'accepted',
      attemptCount: 1,
      generation: 1,
      wake: { status: 'registered', attempt: 1 },
    },
  ];
  return {
    id: 'session-1',
    venueId: 'venue-1',
    version: 4,
    generation: 1,
    state: 'running',
    settingsSnapshot: { durationSeconds: 60, bells: [] },
    remainingSeconds: 60,
    deadline: '2026-11-14T10:01:00.000Z',
    deadlineWake: { status: 'registered', attempt: 1 },
    notifications,
    initiatingPrincipalId: 'operator',
    idempotencyKey: 'start-key',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  };
}

const pause = 'POST#/v1/sessions/{sessionId}/pause' as const;
const resume = 'POST#/v1/sessions/{sessionId}/resume' as const;
const cancel = 'POST#/v1/sessions/{sessionId}/cancel' as const;

describe('U2 control transitions', () => {
  it('pauses with server-derived remaining time and increments version once', () => {
    const result = applyControlTransition(
      makeSession(),
      pause,
      new Date('2026-11-14T10:00:10.250Z'),
    );
    expect(result).toMatchObject({
      state: 'paused',
      remainingSeconds: 50,
      deadline: null,
      version: 5,
      generation: 1,
    });
  });

  it('suspends only pending wake times when paused', () => {
    const result = applyControlTransition(
      makeSession(),
      pause,
      new Date('2026-11-14T10:00:10.000Z'),
    );
    expect(result.notifications[0]).toMatchObject({
      status: 'pending',
      scheduledAt: null,
      expiresAt: null,
      wake: { status: 'pending' },
    });
    expect(result.notifications[1]).toMatchObject({
      status: 'sent',
      dispatchOutcome: 'accepted',
      scheduledAt: '2026-11-14T10:00:00.000Z',
    });
  });

  it('rejects pausing a non-running session', () => {
    expect(() =>
      applyControlTransition(makeSession({ state: 'paused', deadline: null }), pause, new Date()),
    ).toThrow('INVALID_STATE');
  });

  it('resumes from frozen seconds with a new deadline and generation', () => {
    const paused = makeSession({ state: 'paused', deadline: null, remainingSeconds: 40 });
    const result = applyControlTransition(paused, resume, new Date('2026-11-14T10:02:00.000Z'));
    expect(result).toMatchObject({
      state: 'running',
      deadline: '2026-11-14T10:02:40.000Z',
      version: 5,
      generation: 2,
    });
  });

  it('schedules only pending notifications under the resumed generation', () => {
    const paused = makeSession({
      state: 'paused',
      deadline: null,
      remainingSeconds: 40,
      notifications: makeSession().notifications.map((row) =>
        row.status === 'pending' ? { ...row, scheduledAt: null, expiresAt: null } : row,
      ),
    });
    const result = applyControlTransition(paused, resume, new Date('2026-11-14T10:02:00.000Z'));
    expect(result.notifications[0]).toMatchObject({
      generation: 2,
      scheduledAt: '2026-11-14T10:02:10.000Z',
      expiresAt: '2026-11-14T10:02:15.000Z',
      wake: { status: 'pending', attempt: 1 },
    });
    expect(result.notifications[1]).toMatchObject({
      generation: 1,
      status: 'sent',
      scheduledAt: '2026-11-14T10:00:00.000Z',
    });
  });

  it('rejects resuming a non-paused session', () => {
    expect(() => applyControlTransition(makeSession(), resume, new Date())).toThrow(
      'INVALID_STATE',
    );
  });

  it('cancels pending notifications without changing terminal outcomes', () => {
    const result = applyControlTransition(
      makeSession(),
      cancel,
      new Date('2026-11-14T10:00:10.000Z'),
    );
    expect(result).toMatchObject({ state: 'cancelled', deadline: null, version: 5 });
    expect(result.notifications[0]).toMatchObject({
      status: 'cancelled',
      scheduledAt: null,
      expiresAt: null,
    });
    expect(result.notifications[1]).toMatchObject({ status: 'sent', dispatchOutcome: 'accepted' });
  });

  it('waits for an in-flight notification claim before pausing or cancelling', () => {
    const dispatching = makeSession({
      notifications: makeSession().notifications.map((row) =>
        row.id === 'pending' ? { ...row, status: 'dispatching' } : row,
      ),
    });
    expect(() => applyControlTransition(dispatching, pause, new Date())).toThrow('IN_PROGRESS');
    expect(() => applyControlTransition(dispatching, cancel, new Date())).toThrow('IN_PROGRESS');
  });
});
