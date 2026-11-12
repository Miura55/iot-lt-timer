export type WakePurpose = 'deadline' | 'notification';
export declare function deterministicWake(targetId: string, generation: number, purpose: WakePurpose, attempt: number, input: unknown): {
    executionName: string;
    input: string;
    inputHash: string;
};
export declare function mergeDispatchOutcome(current: 'not_attempted' | 'accepted' | 'rejected' | 'ambiguous', next: 'accepted' | 'rejected' | 'ambiguous'): "not_attempted" | "accepted" | "rejected" | "ambiguous";
export declare function terminalNotificationStatus(outcome: 'not_attempted' | 'accepted' | 'rejected' | 'ambiguous', attempted: boolean): "sent" | "failed" | "expired" | "unknown";
