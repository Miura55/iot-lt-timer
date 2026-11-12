import { SFNClient } from '@aws-sdk/client-sfn';
import { type TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';
export interface WakeStartInput {
    targetId: string;
    generation: number;
    purpose: 'deadline' | 'notification';
    scheduledAt: string;
    notificationId?: string;
}
export declare class StepFunctionsWakeRegistrar {
    private readonly client;
    private readonly stateMachineArn;
    private readonly repository;
    constructor(client: SFNClient, stateMachineArn: string, repository: TimerRepository);
    register(session: TimerSession, input: WakeStartInput): Promise<void>;
    reconcile(session: TimerSession, input: WakeStartInput): Promise<void>;
    private resolveExisting;
}
export declare function payloadHash(input: unknown): string;
