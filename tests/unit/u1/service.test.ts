import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notification, TimerSession } from '../../../packages/domain/src/index.js';
import type { TimerRepository } from '../../../apps/api/src/timer/repository.js';
import { getTimerState, startTimer } from '../../../apps/api/src/timer/service.js';

class MemoryRepository implements TimerRepository {
  grants = new Map([['operator:venue-1', ['operate', 'read']]]);
  sessions = new Map<string, TimerSession>();
  keys = new Map<string, { response: unknown; statusCode: number; fingerprint: string }>();
  async getGrant(user: string, venue: string, permission: 'read' | 'configure' | 'operate') {
    return this.grants.get(`${user}:${venue}`)?.includes(permission) ?? false;
  }
  async getSession(id: string) {
    return this.sessions.get(id);
  }
  async getActiveSession(venue: string) {
    return [...this.sessions.values()].find(
      (s) => s.venueId === venue && ['running', 'paused'].includes(s.state),
    );
  }
  async findIdempotent(key: string, route: string, fingerprint: string) {
    const row = this.keys.get(`${key}:${route}`);
    return row
      ? row.fingerprint === fingerprint
        ? { response: row.response, statusCode: row.statusCode }
        : ('conflict' as const)
      : undefined;
  }
  async createSession(
    session: TimerSession,
    fingerprint: string,
    response: unknown,
    statusCode: number,
  ) {
    this.sessions.set(session.id, session);
    this.keys.set(`${session.idempotencyKey}:POST#/v1/sessions`, {
      fingerprint,
      response,
      statusCode,
    });
  }
  async updateSession(session: TimerSession) {
    this.sessions.set(session.id, session);
  }
  async updateNotification(sessionId: string, notification: Notification) {
    const session = this.sessions.get(sessionId)!;
    session.notifications = session.notifications.map((row) =>
      row.id === notification.id ? notification : row,
    );
    return true;
  }
  async setWakeState() {
    return true;
  }
  async markPublishStarted() {
    return true;
  }
  async claimNotification() {
    return undefined;
  }
  async dueWakeRegistrations() {
    return [];
  }
  async dueRecoveryTargets() {
    return [];
  }
}

const input = {
  settings: { durationSeconds: 600, bells: [{ remainingSeconds: 0, ringCount: 3 as const }] },
};
const now = new Date('2026-11-14T10:00:00.000Z');
let repository: MemoryRepository;
let registrar: { register: ReturnType<typeof vi.fn> };

beforeEach(() => {
  repository = new MemoryRepository();
  registrar = { register: vi.fn().mockResolvedValue(undefined) };
});

describe('U1 start and state service', () => {
  it('persists a session and registers a deadline and each notification wake', async () => {
    const result = await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-1',
      input,
      config: { venueId: 'venue-1' },
      now,
    });
    expect(result.statusCode).toBe(201);
    const session = [...repository.sessions.values()][0]!;
    expect(session.deadline).toBe('2026-11-14T10:10:00.000Z');
    expect(registrar.register).toHaveBeenCalledTimes(2);
    expect(registrar.register).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ purpose: 'deadline' }),
    );
  });
  it('rejects a principal without a venue grant', async () => {
    await expect(
      startTimer({
        repository,
        registrar: registrar as never,
        principalId: 'stranger',
        idempotencyKey: 'key-2',
        input,
        config: { venueId: 'venue-1' },
        now,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('requires operate permission even when the principal has read access', async () => {
    repository.grants.set('viewer:venue-1', ['read']);
    await expect(
      startTimer({
        repository,
        registrar: registrar as never,
        principalId: 'viewer',
        idempotencyKey: 'key-read-only',
        input,
        config: { venueId: 'venue-1' },
        now,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects a second concurrent session for the venue', async () => {
    await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-3',
      input,
      config: { venueId: 'venue-1' },
      now,
    });
    await expect(
      startTimer({
        repository,
        registrar: registrar as never,
        principalId: 'operator',
        idempotencyKey: 'key-4',
        input,
        config: { venueId: 'venue-1' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVE_SESSION' });
  });
  it('returns the saved response for an identical idempotent retry', async () => {
    const first = await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-5',
      input,
      config: { venueId: 'venue-1' },
      now,
    });
    const calls = registrar.register.mock.calls.length;
    const retry = await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-5',
      input,
      config: { venueId: 'venue-1' },
      now: new Date(now.getTime() + 1000),
    });
    expect(retry).toEqual(first);
    expect(registrar.register).toHaveBeenCalledTimes(calls);
  });
  it('rejects reuse of an idempotency key with different input', async () => {
    await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-6',
      input,
      config: { venueId: 'venue-1' },
      now,
    });
    await expect(
      startTimer({
        repository,
        registrar: registrar as never,
        principalId: 'operator',
        idempotencyKey: 'key-6',
        input: { settings: { durationSeconds: 601, bells: [] } },
        config: { venueId: 'venue-1' },
        now,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('projects server-based remaining time and hides dispatching as pending', async () => {
    await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-7',
      input,
      config: { venueId: 'venue-1' },
      now,
    });
    const session = [...repository.sessions.values()][0]!;
    session.notifications[0]!.status = 'dispatching';
    const result = await getTimerState(repository, 'venue-1', new Date(now.getTime() + 1_234));
    expect(result.session?.remainingSeconds).toBe(599);
    expect(result.session?.notifications[0]?.status).toBe('pending');
  });
  it('completes a no-bell session after the deadline is reached', async () => {
    const noBell = { settings: { durationSeconds: 1, bells: [] } };
    await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-8',
      input: noBell,
      config: { venueId: 'venue-1' },
      now,
    });
    const result = await getTimerState(repository, 'venue-1', new Date(now.getTime() + 1_001));
    expect(result.session?.state).toBe('completed');
    expect(result.session?.remainingSeconds).toBe(0);
  });
  it('returns the latest terminal session from the venue pointer', async () => {
    await startTimer({
      repository,
      registrar: registrar as never,
      principalId: 'operator',
      idempotencyKey: 'key-terminal',
      input: { settings: { durationSeconds: 60, bells: [] } },
      config: { venueId: 'venue-1' },
      now,
    });
    const session = [...repository.sessions.values()][0]!;
    const completed = {
      ...session,
      state: 'completed' as const,
      deadline: null,
      remainingSeconds: 0,
      version: session.version + 1,
    };
    repository.sessions.set(session.id, completed);
    repository.getActiveSession = async () => completed;
    const state = await getTimerState(repository, 'venue-1', new Date(now.getTime() + 61_000));
    expect(state.session?.id).toBe(completed.id);
    expect(state.session?.state).toBe('completed');
  });
});
