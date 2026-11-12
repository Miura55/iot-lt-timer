import type { Notification, TimerSession } from '@lt-timer/domain';

export interface TimerRepository {
  getGrant(principalId: string, venueId: string, permission: 'read' | 'configure' | 'operate'): Promise<boolean>;
  getSession(sessionId: string): Promise<TimerSession | undefined>;
  getActiveSession(venueId: string): Promise<TimerSession | undefined>;
  findIdempotent(key: string, route: string, fingerprint: string): Promise<{ response: unknown; statusCode: number } | 'conflict' | undefined>;
  createSession(session: TimerSession, fingerprint: string, response: unknown, statusCode: number): Promise<void>;
  updateSession(session: TimerSession): Promise<void>;
  updateNotification(sessionId: string, notification: Notification, expectedStatus: string): Promise<boolean>;
  markPublishStarted(sessionId: string, notificationId: string, claimToken: string, startedAt: string): Promise<boolean>;
  setWakeState(sessionId: string, notificationId: string | undefined, wake: Notification['wake'], previousStatus: string): Promise<boolean>;
  claimNotification(sessionId: string, notificationId: string, generation: number, now: string, leaseUntil: string, claimToken: string): Promise<Notification | undefined>;
  dueWakeRegistrations(now: string, limit?: number): Promise<Array<{ sessionId: string; notificationId?: string }>>;
  dueRecoveryTargets(now: string, limit?: number): Promise<Array<{ sessionId: string; notificationId?: string }>>;
}
