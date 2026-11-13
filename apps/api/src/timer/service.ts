import { randomUUID } from 'node:crypto';
import { applyControlTransition, ControlTransitionError, computeDeadline, createNotificationTimes, validateSettings, type ControlRoute, type Notification, type PendingOperation, type TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';
import { StepFunctionsWakeRegistrar } from './wake-registrar.js';
import { payloadHash } from './wake-registrar.js';
import { operationEvent } from './observability.js';

export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message = code) { super(message); }
}

export interface ServiceConfig { venueId: string }

export async function startTimer(args: { repository: TimerRepository; registrar: StepFunctionsWakeRegistrar; principalId: string; idempotencyKey: string; input: unknown; config: ServiceConfig; now?: Date }) {
  const { repository, registrar, principalId, idempotencyKey, config } = args;
  const now = args.now ?? new Date();
  const settings = validateSettings(extractSettings(args.input));
  if (!(await repository.getGrant(principalId, config.venueId, 'operate'))) throw new HttpError(403, 'FORBIDDEN');
  const fingerprint = payloadHash({ principalId, route: 'POST#/v1/sessions', input: settings });
  const prior = await repository.findIdempotent(idempotencyKey, 'POST#/v1/sessions', fingerprint);
  if (prior === 'conflict') throw new HttpError(409, 'IDEMPOTENCY_CONFLICT');
  if (prior) return { statusCode: prior.statusCode, body: prior.response ?? { accepted: true, processing: true } };
  const active = await repository.getActiveSession(config.venueId);
  if (active && active.state !== 'completed' && active.state !== 'cancelled') throw new HttpError(409, 'ACTIVE_SESSION');
  const deadline = computeDeadline(now, settings.durationSeconds);
  const times = createNotificationTimes(settings, deadline);
  const notifications: Notification[] = times.map((row) => ({
    id: randomUUID(), remainingSeconds: row.remainingSeconds, ringCount: row.ringCount,
    scheduledAt: row.scheduledAt, expiresAt: row.expiresAt, status: 'pending', dispatchOutcome: 'not_attempted',
    attemptCount: 0, generation: 1, wake: { status: 'pending', attempt: 1 },
  }));
  const session: TimerSession = {
    id: randomUUID(), venueId: config.venueId, version: 1, generation: 1, state: 'running', settingsSnapshot: settings,
    remainingSeconds: settings.durationSeconds, deadline: deadline.toISOString(), deadlineWake: { status: 'pending', attempt: 1 },
    notifications, initiatingPrincipalId: principalId, idempotencyKey, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  const state = serializeSession(session, now);
  try {
    await repository.createSession(session, fingerprint, state, 201);
  } catch (error) {
    if ((error as { name?: string }).name !== 'TransactionCanceledException') throw error;
    const raced = await repository.findIdempotent(idempotencyKey, 'POST#/v1/sessions', fingerprint);
    if (raced === 'conflict') throw new HttpError(409, 'IDEMPOTENCY_CONFLICT');
    if (raced) return { statusCode: raced.statusCode, body: raced.response };
    throw new HttpError(409, 'ACTIVE_SESSION');
  }
  const registrations = [
    registrar.register(session, { targetId: session.id, generation: 1, purpose: 'deadline', scheduledAt: session.deadline! }),
    ...notifications.map((notification) => registrar.register(session, { targetId: notification.id, generation: 1, purpose: 'notification', notificationId: notification.id, scheduledAt: notification.scheduledAt! })),
  ];
  await Promise.allSettled(registrations);
  return { statusCode: 201, body: state };
}

export async function getTimerState(repository: TimerRepository, venueId: string, now = new Date()) {
  let session = await repository.getActiveSession(venueId);
  if (!session) return { serverTime: now.toISOString(), session: null };
  const remainingSeconds = session.state === 'running' && session.deadline ? Math.max(0, Math.ceil((Date.parse(session.deadline) - now.getTime()) / 1_000)) : session.remainingSeconds;
  const terminal = new Set(['sent', 'failed', 'expired', 'cancelled', 'unknown']);
  const isComplete = session.state === 'running' && session.deadline && Date.parse(session.deadline) <= now.getTime() && session.notifications.every((notification) => terminal.has(notification.status));
  if (isComplete && !session.pendingOperation) {
    session = { ...session, state: 'completed', remainingSeconds: 0, deadline: null, version: session.version + 1, updatedAt: now.toISOString() };
    await repository.updateSession(session);
  }
  return serializeSession(session, now, remainingSeconds);
}

export async function controlTimer(args: { repository: TimerRepository; registrar: StepFunctionsWakeRegistrar; principalId: string; sessionId: string; route: ControlRoute; idempotencyKey: string; expectedVersion: number; venueId: string; now?: Date; requestId?: string }) {
  const { repository, registrar, principalId, sessionId, route, idempotencyKey, venueId } = args;
  const now = args.now ?? new Date();
  if (!(await repository.getGrant(principalId, venueId, 'operate'))) throw new HttpError(403, 'FORBIDDEN');
  const fingerprint = payloadHash({ principalId, route, sessionId, expectedVersion: args.expectedVersion });
  const prior = await repository.findIdempotent(idempotencyKey, route, fingerprint);
  if (prior === 'conflict') throw new HttpError(409, 'IDEMPOTENCY_CONFLICT');
  if (prior) return { statusCode: prior.statusCode, body: prior.response ?? { code: 'IN_PROGRESS' } };
  const session = await repository.getSession(sessionId);
  if (!session || session.venueId !== venueId) throw new HttpError(404, 'NOT_FOUND');
  if (session.pendingOperation) {
    if (session.pendingOperation.idempotencyKey === idempotencyKey && session.pendingOperation.requestFingerprint === fingerprint) throw new HttpError(409, 'IN_PROGRESS');
    throw new HttpError(409, 'VERSION_CONFLICT');
  }
  if (session.version !== args.expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT');
  const pending: PendingOperation = { idempotencyKey, sessionId, principalId, route, expectedVersion: args.expectedVersion,
    requestFingerprint: fingerprint, leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 30_000).toISOString() };
  if (!(await repository.reserveOperation(sessionId, args.expectedVersion, session.state, pending))) throw new HttpError(409, 'VERSION_CONFLICT');
  return recoverControlOperation(repository, registrar, sessionId, now, pending.leaseToken, args.requestId);
}

export async function recoverControlOperation(repository: TimerRepository, registrar: StepFunctionsWakeRegistrar, sessionId: string, now = new Date(), expectedLeaseToken?: string, requestId?: string) {
  const current = await repository.getSession(sessionId);
  const pending = current?.pendingOperation;
  if (!current || !pending || (expectedLeaseToken && pending.leaseToken !== expectedLeaseToken)) return { statusCode: 409, body: { code: 'IN_PROGRESS' } };
  if (!expectedLeaseToken && Date.parse(pending.leaseExpiresAt) > now.getTime()) return { statusCode: 409, body: { code: 'IN_PROGRESS' } };
  if (current.notifications.some((notice) => notice.status === 'dispatching') && (pending.route.endsWith('/pause') || pending.route.endsWith('/cancel'))) {
    return { statusCode: 409, body: { code: 'IN_PROGRESS' } };
  }
  let transitioned: TimerSession;
  try { transitioned = applyControlTransition(current, pending.route, now); }
  catch (error) {
    if (error instanceof ControlTransitionError) throw new HttpError(409, error.code);
    throw error;
  }
  const body = serializeSession(transitioned, now);
  const previousGeneration = current.generation;
  const receipt = { idempotencyKey: pending.idempotencyKey, route: pending.route, requestFingerprint: pending.requestFingerprint,
    responseStatus: 200, responseBody: body, expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() };
  if (!(await repository.completeOperation(sessionId, pending.expectedVersion, pending.leaseToken, transitioned, receipt))) return { statusCode: 409, body: { code: 'IN_PROGRESS' } };
  operationEvent({ event: 'timer-control-committed', operation: transitioned.state === 'paused' ? 'pause' : transitioned.state === 'cancelled' ? 'cancel' : 'resume', result: 'accepted', sessionId, operationKey: pending.idempotencyKey, version: transitioned.version, generation: transitioned.generation, requestId, timestamp: now });
  if (transitioned.state === 'running' && transitioned.generation > previousGeneration) {
    const registrations = [
      registrar.register(transitioned, { targetId: transitioned.id, generation: transitioned.generation, purpose: 'deadline', scheduledAt: transitioned.deadline! }),
      ...transitioned.notifications.filter((notice) => notice.status === 'pending' && notice.scheduledAt).map((notice) => registrar.register(transitioned, { targetId: notice.id, generation: transitioned.generation, purpose: 'notification', notificationId: notice.id, scheduledAt: notice.scheduledAt! })),
    ];
    await Promise.allSettled(registrations);
  }
  return { statusCode: 200, body };
}

export function serializeSession(session: TimerSession, now: Date, remaining = session.remainingSeconds) {
  return {
    serverTime: now.toISOString(),
    session: {
      id: session.id, version: session.version, generation: session.generation, state: session.state,
      settingsSnapshot: session.settingsSnapshot, remainingSeconds: session.state === 'completed' ? 0 : remaining,
      deadline: session.deadline, notifications: session.notifications.map((notification) => ({
        id: notification.id, remainingSeconds: notification.remainingSeconds, ringCount: notification.ringCount,
        scheduledAt: notification.scheduledAt, expiresAt: notification.expiresAt,
        status: notification.status === 'dispatching' ? 'pending' : notification.status,
      })),
    },
  };
}

function extractSettings(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'VALIDATION_ERROR');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !('settings' in body)) throw new HttpError(400, 'VALIDATION_ERROR', 'Request must contain settings only');
  return body.settings;
}

export function buildSession(args: { id: string; venueId: string; principalId: string; key: string; input: unknown; now: Date }): TimerSession {
  const settings = validateSettings(extractSettings(args.input));
  const deadline = computeDeadline(args.now, settings.durationSeconds);
  return {
    id: args.id, venueId: args.venueId, version: 1, generation: 1, state: 'running', settingsSnapshot: settings,
    remainingSeconds: settings.durationSeconds, deadline: deadline.toISOString(), deadlineWake: { status: 'pending', attempt: 1 },
    notifications: createNotificationTimes(settings, deadline).map((row) => ({
      id: randomUUID(), remainingSeconds: row.remainingSeconds, ringCount: row.ringCount,
      scheduledAt: row.scheduledAt, expiresAt: row.expiresAt, status: 'pending', dispatchOutcome: 'not_attempted',
      attemptCount: 0, generation: 1, wake: { status: 'pending', attempt: 1 },
    })), initiatingPrincipalId: args.principalId, idempotencyKey: args.key,
    createdAt: args.now.toISOString(), updatedAt: args.now.toISOString(),
  };
}
