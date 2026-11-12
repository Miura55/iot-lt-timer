import type { TimerSettings } from './types.js';
export declare const NOTIFICATION_TTL_MS = 5000;
export declare const RECOVERY_BUFFER_SECONDS = 65;
export declare function computeDeadline(now: Date, durationSeconds: number): Date;
export declare function createNotificationTimes(settings: TimerSettings, deadline: Date): {
    scheduledAt: string;
    expiresAt: string;
    remainingSeconds: number;
    ringCount: 1 | 2 | 3;
}[];
export declare function recoveryTarget(deadline: Date, expiries: readonly Date[]): Date;
export declare function canPublish(now: Date, scheduledAt: Date, expiresAt: Date): boolean;
export declare function createRingCommand(input: {
    id: string;
    sessionId: string;
    ringCount: 1 | 2 | 3;
    scheduledAt: string;
    expiresAt: string;
}): {
    schemaVersion: 1;
    commandId: string;
    sessionId: string;
    ringCount: 1 | 2 | 3;
    intervalMs: 500;
    scheduledAtMs: number;
    expiresAtMs: number;
};
