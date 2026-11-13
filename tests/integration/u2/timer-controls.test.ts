import { describe, expect, it, vi } from 'vitest';
import type { Notification, TimerSession } from '../../../packages/domain/src/index.js';
import { controlTimer } from '../../../apps/api/src/timer/service.js';
import { createDispatcher } from '../../../apps/api/src/timer/dispatcher.js';
import { createReconciler } from '../../../apps/api/src/timer/reconciler.js';

const now = new Date('2026-11-14T10:00:01.000Z');
function makeSession(state: TimerSession['state'] = 'running'): TimerSession {
  const notice: Notification = { id: 'notice', remainingSeconds: 0, ringCount: 1, scheduledAt: '2026-11-14T10:00:00.000Z', expiresAt: '2026-11-14T10:00:05.000Z', status: 'pending', dispatchOutcome: 'not_attempted', attemptCount: 0, generation: 1, wake: { status: 'registered', attempt: 1 } };
  return { id: 's-1', venueId: 'v-1', version: 1, generation: 1, state, settingsSnapshot: { durationSeconds: 60, bells: [{ remainingSeconds: 0, ringCount: 1 }] }, remainingSeconds: 60,
    deadline: state === 'running' ? '2026-11-14T10:01:00.000Z' : null, deadlineWake: { status: state === 'running' ? 'registered' : 'pending', attempt: 1 }, notifications: [notice], initiatingPrincipalId: 'owner', idempotencyKey: 'start', createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
function harness(initial = makeSession()) {
  let state = initial;
  const repo = {
    getGrant: vi.fn().mockResolvedValue(true), findIdempotent: vi.fn().mockResolvedValue(undefined), getSession: vi.fn(async () => state),
    reserveOperation: vi.fn(async (_id: string, _version: number, _expected: string, pending: TimerSession['pendingOperation']) => { state = { ...state, pendingOperation: pending }; return true; }),
    completeOperation: vi.fn(async (_id: string, _version: number, _lease: string, next: TimerSession) => { state = { ...next, pendingOperation: undefined }; return true; }),
    claimNotification: vi.fn(async (_id: string, noticeId: string, generation: number) => {
      if (state.state !== 'running' || state.generation !== generation || state.pendingOperation) return undefined;
      const row = state.notifications.find((notice) => notice.id === noticeId);
      if (!row || row.status !== 'pending') return undefined;
      Object.assign(row, { status: 'dispatching', claimToken: 'claim', claimExpiresAt: '2026-11-14T10:00:11.000Z' }); return row;
    }),
    markPublishStarted: vi.fn(async () => true),
    updateNotification: vi.fn(async (_id: string, updated: Notification) => { const at = state.notifications.findIndex((row) => row.id === updated.id); state.notifications[at] = updated; return true; }),
    updateSession: vi.fn(async (next: TimerSession) => { state = next; return true; }),
    dueWakeRegistrations: vi.fn(async () => state.state === 'running' && state.deadlineWake.status !== 'registered' ? [{ sessionId: state.id }] : []),
    dueRecoveryTargets: vi.fn().mockResolvedValue([]),
  };
  return { repo, current: () => state };
}
const operation = { principalId: 'owner', sessionId: 's-1', venueId: 'v-1', expectedVersion: 1, idempotencyKey: '123e4567-e89b-12d3-a456-426614174000', now };
const controlRegistrar = { register: vi.fn().mockResolvedValue(undefined) };

describe('U2 API/repository/wake/dispatcher boundaries', () => {
  it('makes a pause win before notification claim and leaves the stale dispatcher as a no-op', async () => {
    const h = harness();
    await controlTimer({ ...operation, route: 'POST#/v1/sessions/{sessionId}/pause', repository: h.repo as never, registrar: controlRegistrar as never });
    const dispatch = createDispatcher(h.repo as never, { publish: vi.fn().mockResolvedValue('accepted') }, { venueId: 'v-1', topic: 'topic', now: () => now });
    await expect(dispatch({ sessionId: 's-1', generation: 1, purpose: 'notification', notificationId: 'notice' })).resolves.toEqual({ outcome: 'stale' });
    expect(h.current().state).toBe('paused');
    expect(h.repo.claimNotification).not.toHaveBeenCalled();
  });
  it('makes cancel win before a notification claim and prevents publishing the bell', async () => {
    const h = harness();
    await controlTimer({ ...operation, route: 'POST#/v1/sessions/{sessionId}/cancel', repository: h.repo as never, registrar: controlRegistrar as never });
    const publish = vi.fn().mockResolvedValue('accepted');
    const dispatch = createDispatcher(h.repo as never, { publish }, { venueId: 'v-1', topic: 'topic', now: () => now });
    await expect(dispatch({ sessionId: 's-1', generation: 1, purpose: 'notification', notificationId: 'notice' })).resolves.toEqual({ outcome: 'stale' });
    expect(h.current().state).toBe('cancelled');
    expect(h.repo.claimNotification).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it('serializes pause behind an already claimed notification without changing the session', async () => {
    const initial = makeSession(); initial.notifications[0]!.status = 'dispatching'; initial.notifications[0]!.claimExpiresAt = '2026-11-14T10:00:10.000Z';
    const h = harness(initial);
    await expect(controlTimer({ ...operation, route: 'POST#/v1/sessions/{sessionId}/pause', repository: h.repo as never, registrar: controlRegistrar as never })).resolves.toMatchObject({ statusCode: 409, body: { code: 'IN_PROGRESS' } });
    expect(h.current().state).toBe('running');
    expect(h.current().pendingOperation).toBeDefined();
  });
  it('commits resume before wake repair and lets the bounded wake query reconcile it', async () => {
    const initial = makeSession('paused');
    const h = harness(initial);
    const registrar = { register: vi.fn().mockRejectedValueOnce(new Error('ambiguous registration')).mockResolvedValue(undefined), reconcile: vi.fn().mockResolvedValue(undefined) };
    await controlTimer({ ...operation, route: 'POST#/v1/sessions/{sessionId}/resume', repository: h.repo as never, registrar: registrar as never });
    expect(h.current().state).toBe('running');
    expect(h.current().generation).toBe(2);
    await createReconciler(h.repo as never, registrar as never, vi.fn(), { now: () => now })();
    expect(registrar.reconcile).toHaveBeenCalledWith(expect.objectContaining({ generation: 2 }), expect.objectContaining({ purpose: 'deadline', generation: 2 }));
  });
  it('recovers an expired persisted operation lease from the bounded RecoveryIndex query', async () => {
    const initial = makeSession();
    initial.pendingOperation = { idempotencyKey: 'op', sessionId: initial.id, principalId: 'owner', route: 'POST#/v1/sessions/{sessionId}/pause', expectedVersion: 1, requestFingerprint: 'hash', leaseToken: 'lease', leaseExpiresAt: '2026-11-14T10:00:00.000Z' };
    const h = harness(initial);
    h.repo.dueRecoveryTargets.mockResolvedValue([{ sessionId: 's-1' }]);
    const registrar = { register: vi.fn().mockResolvedValue(undefined), reconcile: vi.fn().mockResolvedValue(undefined) };
    await createReconciler(h.repo as never, registrar as never, vi.fn(), { now: () => now })();
    expect(h.current().state).toBe('paused');
    expect(h.current().pendingOperation).toBeUndefined();
  });
  it('keeps publish-ambiguous expired notifications unknown and treats repeated wake events as duplicates', async () => {
    const initial = makeSession();
    const notice = initial.notifications[0]!;
    notice.status = 'dispatching'; notice.publishStartedAt = '2026-11-14T09:59:55.000Z'; notice.claimExpiresAt = '2026-11-14T10:00:00.000Z'; notice.expiresAt = '2026-11-14T10:00:00.000Z';
    const h = harness(initial);
    const publish = vi.fn().mockResolvedValue('accepted');
    const dispatch = createDispatcher(h.repo as never, { publish }, { venueId: 'v-1', topic: 'topic', now: () => now });
    await expect(dispatch({ sessionId: 's-1', generation: 1, purpose: 'notification', notificationId: 'notice' })).resolves.toEqual({ outcome: 'unknown' });
    expect(h.current().notifications[0]?.status).toBe('unknown');
    await expect(dispatch({ sessionId: 's-1', generation: 1, purpose: 'notification', notificationId: 'notice' })).resolves.toEqual({ outcome: 'duplicate-or-stale' });
    expect(publish).not.toHaveBeenCalled();
  });
});
