export type SessionState = 'running' | 'paused' | 'completed' | 'cancelled';
export type NotificationStatus = 'pending' | 'dispatching' | 'sent' | 'failed' | 'expired' | 'cancelled' | 'unknown';
export type WakeStatus = 'pending' | 'registered' | 'failed';
export type DispatchOutcome = 'not_attempted' | 'accepted' | 'rejected' | 'ambiguous';
export type ControlRoute = 'POST#/v1/sessions/{sessionId}/pause' | 'POST#/v1/sessions/{sessionId}/resume' | 'POST#/v1/sessions/{sessionId}/cancel';

export interface OperationReceipt {
  idempotencyKey: string;
  route: string;
  requestFingerprint: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: string;
}

export interface PendingOperation {
  idempotencyKey: string;
  sessionId: string;
  principalId: string;
  route: ControlRoute;
  expectedVersion: number;
  requestFingerprint: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface BellPoint { remainingSeconds: number; ringCount: 1 | 2 | 3 }
export interface TimerSettings { durationSeconds: number; bells: BellPoint[] }
export interface WakeRegistration {
  status: WakeStatus; attempt: number; executionName?: string; inputHash?: string;
  registeredAt?: string; lastError?: string;
}
export interface Notification {
  id: string; remainingSeconds: number; ringCount: 1 | 2 | 3; scheduledAt: string | null;
  expiresAt: string | null; status: NotificationStatus; dispatchOutcome: DispatchOutcome;
  attemptCount: number; generation: number; wake: WakeRegistration;
  claimToken?: string; claimExpiresAt?: string; publishStartedAt?: string;
}
export interface TimerSession {
  id: string; venueId: string; version: number; generation: number; state: SessionState;
  settingsSnapshot: TimerSettings; remainingSeconds: number; deadline: string | null;
  deadlineWake: WakeRegistration; notifications: Notification[]; initiatingPrincipalId: string;
  idempotencyKey: string; createdAt: string; updatedAt: string;
  pendingOperation?: PendingOperation;
}
export interface StartInput extends TimerSettings {}
export interface RingCommand {
  schemaVersion: 1; commandId: string; sessionId: string; ringCount: 1 | 2 | 3;
  intervalMs: 500; scheduledAtMs: number; expiresAtMs: number;
}
