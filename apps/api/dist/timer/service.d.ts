import { type TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';
import { StepFunctionsWakeRegistrar } from './wake-registrar.js';
export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(statusCode: number, code: string, message?: string);
}
export interface ServiceConfig {
    venueId: string;
}
export declare function startTimer(args: {
    repository: TimerRepository;
    registrar: StepFunctionsWakeRegistrar;
    principalId: string;
    idempotencyKey: string;
    input: unknown;
    config: ServiceConfig;
    now?: Date;
}): Promise<{
    statusCode: number;
    body: unknown;
}>;
export declare function getTimerState(repository: TimerRepository, venueId: string, now?: Date): Promise<{
    serverTime: string;
    session: {
        id: string;
        version: number;
        generation: number;
        state: import("@lt-timer/domain").SessionState;
        settingsSnapshot: import("@lt-timer/domain").TimerSettings;
        remainingSeconds: number;
        deadline: string | null;
        notifications: {
            id: string;
            remainingSeconds: number;
            ringCount: 1 | 2 | 3;
            scheduledAt: string;
            expiresAt: string;
            status: "cancelled" | "pending" | "sent" | "failed" | "expired" | "unknown";
        }[];
    };
} | {
    serverTime: string;
    session: null;
}>;
export declare function serializeSession(session: TimerSession, now: Date, remaining?: number): {
    serverTime: string;
    session: {
        id: string;
        version: number;
        generation: number;
        state: import("@lt-timer/domain").SessionState;
        settingsSnapshot: import("@lt-timer/domain").TimerSettings;
        remainingSeconds: number;
        deadline: string | null;
        notifications: {
            id: string;
            remainingSeconds: number;
            ringCount: 1 | 2 | 3;
            scheduledAt: string;
            expiresAt: string;
            status: "cancelled" | "pending" | "sent" | "failed" | "expired" | "unknown";
        }[];
    };
};
export declare function buildSession(args: {
    id: string;
    venueId: string;
    principalId: string;
    key: string;
    input: unknown;
    now: Date;
}): TimerSession;
