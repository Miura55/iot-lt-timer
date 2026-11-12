import { randomUUID } from 'node:crypto';
import { computeDeadline, createNotificationTimes, validateSettings } from '@lt-timer/domain';
import { payloadHash } from './wake-registrar.js';
export class HttpError extends Error {
    statusCode;
    code;
    constructor(statusCode, code, message = code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
export async function startTimer(args) {
    const { repository, registrar, principalId, idempotencyKey, config } = args;
    const now = args.now ?? new Date();
    const settings = validateSettings(extractSettings(args.input));
    if (!(await repository.getGrant(principalId, config.venueId, 'operate')))
        throw new HttpError(403, 'FORBIDDEN');
    const fingerprint = payloadHash({ principalId, route: 'POST#/v1/sessions', input: settings });
    const prior = await repository.findIdempotent(idempotencyKey, 'POST#/v1/sessions', fingerprint);
    if (prior === 'conflict')
        throw new HttpError(409, 'IDEMPOTENCY_CONFLICT');
    if (prior)
        return { statusCode: prior.statusCode, body: prior.response ?? { accepted: true, processing: true } };
    const active = await repository.getActiveSession(config.venueId);
    if (active && active.state !== 'completed' && active.state !== 'cancelled')
        throw new HttpError(409, 'ACTIVE_SESSION');
    const deadline = computeDeadline(now, settings.durationSeconds);
    const times = createNotificationTimes(settings, deadline);
    const notifications = times.map((row) => ({
        id: randomUUID(), remainingSeconds: row.remainingSeconds, ringCount: row.ringCount,
        scheduledAt: row.scheduledAt, expiresAt: row.expiresAt, status: 'pending', dispatchOutcome: 'not_attempted',
        attemptCount: 0, generation: 1, wake: { status: 'pending', attempt: 1 },
    }));
    const session = {
        id: randomUUID(), venueId: config.venueId, version: 1, generation: 1, state: 'running', settingsSnapshot: settings,
        remainingSeconds: settings.durationSeconds, deadline: deadline.toISOString(), deadlineWake: { status: 'pending', attempt: 1 },
        notifications, initiatingPrincipalId: principalId, idempotencyKey, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    const state = serializeSession(session, now);
    try {
        await repository.createSession(session, fingerprint, state, 201);
    }
    catch (error) {
        if (error.name !== 'TransactionCanceledException')
            throw error;
        const raced = await repository.findIdempotent(idempotencyKey, 'POST#/v1/sessions', fingerprint);
        if (raced === 'conflict')
            throw new HttpError(409, 'IDEMPOTENCY_CONFLICT');
        if (raced)
            return { statusCode: raced.statusCode, body: raced.response };
        throw new HttpError(409, 'ACTIVE_SESSION');
    }
    const registrations = [
        registrar.register(session, { targetId: session.id, generation: 1, purpose: 'deadline', scheduledAt: session.deadline }),
        ...notifications.map((notification) => registrar.register(session, { targetId: notification.id, generation: 1, purpose: 'notification', notificationId: notification.id, scheduledAt: notification.scheduledAt })),
    ];
    await Promise.allSettled(registrations);
    return { statusCode: 201, body: state };
}
export async function getTimerState(repository, venueId, now = new Date()) {
    let session = await repository.getActiveSession(venueId);
    if (!session)
        return { serverTime: now.toISOString(), session: null };
    const remainingSeconds = session.state === 'running' && session.deadline ? Math.max(0, Math.ceil((Date.parse(session.deadline) - now.getTime()) / 1_000)) : session.remainingSeconds;
    const terminal = new Set(['sent', 'failed', 'expired', 'cancelled', 'unknown']);
    const isComplete = session.state === 'running' && session.deadline && Date.parse(session.deadline) <= now.getTime() && session.notifications.every((notification) => terminal.has(notification.status));
    if (isComplete) {
        session = { ...session, state: 'completed', remainingSeconds: 0, deadline: null, version: session.version + 1, updatedAt: now.toISOString() };
        await repository.updateSession(session);
    }
    return serializeSession(session, now, remainingSeconds);
}
export function serializeSession(session, now, remaining = session.remainingSeconds) {
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
function extractSettings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new HttpError(400, 'VALIDATION_ERROR');
    const body = input;
    if (Object.keys(body).length !== 1 || !('settings' in body))
        throw new HttpError(400, 'VALIDATION_ERROR', 'Request must contain settings only');
    return body.settings;
}
export function buildSession(args) {
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
//# sourceMappingURL=service.js.map