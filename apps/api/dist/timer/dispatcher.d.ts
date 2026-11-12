import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane';
import type { TimerRepository } from './repository.js';
export interface DispatchEvent {
    sessionId: string;
    generation: number;
    purpose: 'deadline' | 'notification';
    notificationId?: string;
}
export interface BellPublisher {
    publish(topic: string, payload: string): Promise<'accepted' | 'rejected' | 'ambiguous'>;
}
export declare class AwsIotBellPublisher implements BellPublisher {
    private readonly client;
    constructor(client: IoTDataPlaneClient);
    publish(topic: string, payload: string): Promise<"accepted" | "rejected" | "ambiguous">;
}
export declare function createDispatcher(repository: TimerRepository, publisher: BellPublisher, options: {
    venueId: string;
    topic: string;
    now?: () => Date;
}): (event: DispatchEvent) => Promise<{
    outcome: string;
} | {
    outcome: string;
    accepted: boolean;
}>;
export declare function createMockPublisher(outcomes?: Array<'accepted' | 'rejected' | 'ambiguous'>): BellPublisher & {
    messages: Array<{
        topic: string;
        command: unknown;
    }>;
};
