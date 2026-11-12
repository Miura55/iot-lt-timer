import type { TimerRepository } from './repository.js';
import type { StepFunctionsWakeRegistrar } from './wake-registrar.js';
import type { TimerSession } from '@lt-timer/domain';
import type { DispatchEvent } from './dispatcher.js';
export declare function createReconciler(repository: TimerRepository, registrar: StepFunctionsWakeRegistrar, dispatch: (event: DispatchEvent) => Promise<unknown>, options?: {
    now?: () => Date;
}): () => Promise<{
    checked: number;
    repaired: number;
}>;
export declare function dueTargets(session: TimerSession, now: Date): ({
    purpose: "notification";
    targetId: string;
    notificationId: string;
} | {
    purpose: "deadline";
    targetId: string;
})[];
