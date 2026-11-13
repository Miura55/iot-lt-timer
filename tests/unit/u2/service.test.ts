import { describe, expect, it, vi } from 'vitest';
import type { TimerSession } from '../../../packages/domain/src/index.js';
import { controlTimer, HttpError, recoverControlOperation } from '../../../apps/api/src/timer/service.js';

function session(state: TimerSession['state'] = 'running'): TimerSession {
  return { id: 's-1', venueId: 'v-1', version: 4, generation: 1, state, settingsSnapshot: { durationSeconds: 60, bells: [] }, remainingSeconds: 60,
    deadline: state === 'running' ? '2026-11-14T10:01:00.000Z' : null, deadlineWake: { status: 'registered', attempt: 1 }, notifications: [],
    initiatingPrincipalId: 'user', idempotencyKey: 'start', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z' };
}
function fixture(current = session()) {
  const repository = { getGrant: vi.fn().mockResolvedValue(true), getSession: vi.fn().mockImplementation(async () => current), findIdempotent: vi.fn().mockResolvedValue(undefined),
    reserveOperation: vi.fn().mockImplementation(async (_id: string, _version: number, _state: string, operation: TimerSession['pendingOperation']) => { current.pendingOperation = operation; return true; }),
    completeOperation: vi.fn().mockImplementation(async (_id: string, _version: number, _lease: string, next: TimerSession) => { Object.assign(current, next); current.pendingOperation = undefined; return true; }) };
  const registrar = { register: vi.fn().mockResolvedValue(undefined) };
  return { repository, registrar };
}
const args = { principalId: 'user', sessionId: 's-1', route: 'POST#/v1/sessions/{sessionId}/pause' as const, idempotencyKey: '123e4567-e89b-12d3-a456-426614174000', expectedVersion: 4, venueId: 'v-1', now: new Date('2026-11-14T10:00:10.000Z') };

describe('U2 timer control service', () => {
  it('requires operate grant before reserving a transition', async () => {
    const f = fixture(); f.repository.getGrant.mockResolvedValue(false);
    await expect(controlTimer({ ...args, ...f })).rejects.toMatchObject({ statusCode: 403 });
    expect(f.repository.reserveOperation).not.toHaveBeenCalled();
  });
  it('returns a matching idempotent response without a second reservation', async () => {
    const f = fixture(); f.repository.findIdempotent.mockResolvedValue({ response: { ok: true }, statusCode: 200 });
    await expect(controlTimer({ ...args, ...f })).resolves.toEqual({ statusCode: 200, body: { ok: true } });
    expect(f.repository.reserveOperation).not.toHaveBeenCalled();
  });
  it('rejects a stale expectedVersion before writing', async () => {
    const f = fixture();
    await expect(controlTimer({ ...args, expectedVersion: 2, ...f })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(f.repository.reserveOperation).not.toHaveBeenCalled();
  });
  it('reserves then commits pause using server time and a durable receipt', async () => {
    const f = fixture();
    const result = await controlTimer({ ...args, ...f });
    expect(f.repository.reserveOperation).toHaveBeenCalledWith('s-1', 4, 'running', expect.objectContaining({ route: args.route }));
    expect(f.repository.completeOperation).toHaveBeenCalledWith('s-1', 4, expect.any(String), expect.objectContaining({ state: 'paused', remainingSeconds: 50 }), expect.objectContaining({ responseStatus: 200 }));
    expect(result.statusCode).toBe(200);
  });
  it('registers a fresh deadline and notification wakes on resume', async () => {
    const f = fixture(session('paused'));
    await controlTimer({ ...args, route: 'POST#/v1/sessions/{sessionId}/resume', ...f });
    expect(f.registrar.register).toHaveBeenCalledWith(expect.objectContaining({ state: 'running', generation: 2 }), expect.objectContaining({ purpose: 'deadline', generation: 2 }));
  });
  it('leaves an abandoned operation in progress until the persisted lease expires', async () => {
    const current = { ...session(), pendingOperation: { ...args, sessionId: 's-1', principalId: 'user', requestFingerprint: 'hash', leaseToken: 'lease', leaseExpiresAt: '2026-11-14T10:00:30.000Z' } } as TimerSession;
    const f = fixture(current);
    await expect(recoverControlOperation(f.repository as never, f.registrar as never, 's-1', args.now)).resolves.toMatchObject({ statusCode: 409 });
    expect(f.repository.completeOperation).not.toHaveBeenCalled();
  });
});
