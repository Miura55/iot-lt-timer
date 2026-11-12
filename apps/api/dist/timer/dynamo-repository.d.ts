import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Notification, TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';
export declare class DynamoTimerRepository implements TimerRepository {
    private readonly db;
    private readonly tableName;
    constructor(db: DynamoDBDocumentClient, tableName: string);
    getGrant(principalId: string, venueId: string, permission: 'read' | 'configure' | 'operate'): Promise<boolean>;
    getSession(sessionId: string): Promise<TimerSession | undefined>;
    getActiveSession(venueId: string): Promise<TimerSession | undefined>;
    findIdempotent(key: string, route: string, fingerprint: string): Promise<"conflict" | {
        response: any;
        statusCode: number;
    } | undefined>;
    createSession(session: TimerSession, fingerprint: string, response: unknown, statusCode: number): Promise<void>;
    updateSession(session: TimerSession): Promise<void>;
    updateNotification(sessionId: string, notification: Notification, expectedStatus: string): Promise<boolean>;
    setWakeState(sessionId: string, notificationId: string | undefined, wake: Notification['wake'], previousStatus: string): Promise<boolean>;
    claimNotification(sessionId: string, notificationId: string, generation: number, now: string, leaseUntil: string, claimToken: string): Promise<Notification | undefined>;
    markPublishStarted(sessionId: string, notificationId: string, claimToken: string, startedAt: string): Promise<boolean>;
    dueWakeRegistrations(now: string, limit?: number): Promise<{
        sessionId: string;
        notificationId: string | undefined;
    }[]>;
    dueRecoveryTargets(now: string, limit?: number): Promise<{
        sessionId: string;
        notificationId: string | undefined;
    }[]>;
    saveIdempotent(key: string, route: string, fingerprint: string, response: unknown, statusCode: number): Promise<void>;
    private hydrate;
    private notification;
}
