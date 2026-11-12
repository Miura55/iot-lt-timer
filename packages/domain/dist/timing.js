export const NOTIFICATION_TTL_MS = 5_000;
export const RECOVERY_BUFFER_SECONDS = 65;
export function computeDeadline(now, durationSeconds) {
    return new Date(now.getTime() + durationSeconds * 1_000);
}
export function createNotificationTimes(settings, deadline) {
    return [...settings.bells].sort((a, b) => b.remainingSeconds - a.remainingSeconds).map((bell) => {
        const scheduledAt = new Date(deadline.getTime() - bell.remainingSeconds * 1_000);
        return {
            ...bell,
            scheduledAt: scheduledAt.toISOString(),
            expiresAt: new Date(scheduledAt.getTime() + NOTIFICATION_TTL_MS).toISOString(),
        };
    });
}
export function recoveryTarget(deadline, expiries) {
    const latestExpiry = expiries.reduce((latest, expiry) => Math.max(latest, expiry.getTime()), deadline.getTime());
    const start = expiries.length === 0 ? deadline.getTime() : Math.max(deadline.getTime(), latestExpiry);
    return new Date(start + RECOVERY_BUFFER_SECONDS * 1_000);
}
export function canPublish(now, scheduledAt, expiresAt) {
    return now.getTime() >= scheduledAt.getTime() && now.getTime() < expiresAt.getTime();
}
export function createRingCommand(input) {
    return {
        schemaVersion: 1, commandId: input.id, sessionId: input.sessionId, ringCount: input.ringCount,
        intervalMs: 500, scheduledAtMs: Date.parse(input.scheduledAt), expiresAtMs: Date.parse(input.expiresAt),
    };
}
//# sourceMappingURL=timing.js.map