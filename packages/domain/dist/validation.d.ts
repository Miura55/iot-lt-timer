import type { TimerSettings } from './types.js';
export declare const MIN_DURATION_SECONDS = 1;
export declare const MAX_DURATION_SECONDS = 10800;
export declare const MAX_NOTIFICATIONS = 10;
export declare const MIN_NOTIFICATION_GAP_SECONDS = 2;
export declare function validateSettings(input: unknown): TimerSettings;
