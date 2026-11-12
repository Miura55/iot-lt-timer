import { randomUUID } from 'node:crypto';
import { PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { canPublish, createRingCommand, terminalNotificationStatus } from '@lt-timer/domain';
export class AwsIotBellPublisher {
    client;
    constructor(client) {
        this.client = client;
    }
    async publish(topic, payload) {
        try {
            await this.client.send(new PublishCommand({ topic, qos: 1, retain: false, payload: new TextEncoder().encode(payload) }));
            return 'accepted';
        }
        catch (error) {
            const status = error.$metadata?.httpStatusCode;
            return status !== undefined && status < 500 ? 'rejected' : 'ambiguous';
        }
    }
}
export function createDispatcher(repository, publisher, options) {
    return async (event) => {
        const now = (options.now ?? (() => new Date()))();
        let session = await repository.getSession(event.sessionId);
        if (!session || session.state !== 'running' || session.generation !== event.generation)
            return { outcome: 'stale' };
        if (event.purpose === 'deadline')
            return completeIfDue(repository, session, now);
        if (!event.notificationId)
            throw new Error('notificationId is required');
        const candidate = session.notifications.find((row) => row.id === event.notificationId);
        if (!candidate || !['pending', 'dispatching'].includes(candidate.status) || candidate.generation !== event.generation)
            return { outcome: 'duplicate-or-stale' };
        const scheduledAt = new Date(candidate.scheduledAt);
        const expiresAt = new Date(candidate.expiresAt);
        if (candidate.status === 'dispatching') {
            const leaseExpired = !candidate.claimExpiresAt || Date.parse(candidate.claimExpiresAt) <= now.getTime();
            if (!leaseExpired)
                return { outcome: 'lease-active' };
            if (candidate.publishStartedAt) {
                const uncertain = { ...candidate, status: 'unknown', dispatchOutcome: 'ambiguous', claimToken: undefined, claimExpiresAt: undefined, updatedAt: now.toISOString() };
                await repository.updateNotification(session.id, uncertain, 'dispatching');
                await maybeComplete(repository, session, now);
                return { outcome: 'unknown' };
            }
        }
        if (now.getTime() >= expiresAt.getTime()) {
            const outcome = candidate.dispatchOutcome;
            const status = terminalNotificationStatus(outcome, candidate.attemptCount > 0 || Boolean(candidate.publishStartedAt));
            const expired = { ...candidate, status, dispatchOutcome: outcome, claimToken: undefined, claimExpiresAt: undefined, updatedAt: now.toISOString() };
            await repository.updateNotification(session.id, expired, candidate.status);
            await maybeComplete(repository, session, now);
            return { outcome: status };
        }
        if (now.getTime() < scheduledAt.getTime())
            return { outcome: 'early' };
        const claimToken = randomUUID();
        const claimed = await repository.claimNotification(session.id, candidate.id, event.generation, now.toISOString(), new Date(now.getTime() + 10_000).toISOString(), claimToken);
        if (!claimed)
            return { outcome: 'claimed-elsewhere' };
        const startedAt = (options.now ?? (() => new Date()))();
        if (!canPublish(startedAt, scheduledAt, expiresAt) || !(await repository.markPublishStarted(session.id, candidate.id, claimToken, startedAt.toISOString()))) {
            return { outcome: 'publish-not-started' };
        }
        const command = createRingCommand({ id: candidate.id, sessionId: session.id, ringCount: candidate.ringCount, scheduledAt: candidate.scheduledAt, expiresAt: candidate.expiresAt });
        let cumulative = candidate.dispatchOutcome;
        let attemptCount = candidate.attemptCount;
        for (let attempt = 0; attempt < 2 && canPublish((options.now ?? (() => new Date()))(), scheduledAt, expiresAt); attempt += 1) {
            const result = await publisher.publish(options.topic, JSON.stringify(command));
            attemptCount += 1;
            if (result === 'accepted') {
                cumulative = 'accepted';
                break;
            }
            if (result === 'ambiguous')
                cumulative = 'ambiguous';
            else if (cumulative === 'not_attempted')
                cumulative = 'rejected';
        }
        const finalNow = (options.now ?? (() => new Date()))();
        const finalStatus = cumulative === 'accepted' ? 'sent' : finalNow >= expiresAt ? terminalNotificationStatus(cumulative, attemptCount > 0) : 'dispatching';
        const updated = {
            ...claimed, status: finalStatus, dispatchOutcome: cumulative, attemptCount, claimToken: undefined,
            claimExpiresAt: undefined, updatedAt: finalNow.toISOString(),
        };
        await repository.updateNotification(session.id, updated, 'dispatching');
        session = (await repository.getSession(session.id)) ?? session;
        await maybeComplete(repository, session, finalNow);
        return { outcome: finalStatus, accepted: cumulative === 'accepted' };
    };
}
async function completeIfDue(repository, session, now) {
    if (!session.deadline || Date.parse(session.deadline) > now.getTime())
        return { outcome: 'not-due' };
    return maybeComplete(repository, session, now);
}
async function maybeComplete(repository, session, now) {
    const terminal = new Set(['sent', 'failed', 'expired', 'cancelled', 'unknown']);
    if (!session.deadline || Date.parse(session.deadline) > now.getTime() || !session.notifications.every((row) => terminal.has(row.status)))
        return { outcome: 'pending-notifications' };
    await repository.updateSession({ ...session, state: 'completed', remainingSeconds: 0, deadline: null, version: session.version + 1, updatedAt: now.toISOString() });
    return { outcome: 'completed' };
}
export function createMockPublisher(outcomes = ['accepted']) {
    const messages = [];
    let index = 0;
    return {
        messages,
        async publish(topic, payload) {
            messages.push({ topic, command: JSON.parse(payload) });
            const outcome = outcomes[Math.min(index, outcomes.length - 1)] ?? 'ambiguous';
            index += 1;
            return outcome;
        },
    };
}
//# sourceMappingURL=dispatcher.js.map