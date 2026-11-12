import type { BellPoint, TimerSettings } from './types.js';

export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 10_800;
export const MAX_NOTIFICATIONS = 10;
export const MIN_NOTIFICATION_GAP_SECONDS = 2;

export function validateSettings(input: unknown): TimerSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SETTINGS');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['durationSeconds', 'bells'].includes(key))) throw new Error('INVALID_SETTINGS');
  const duration = value.durationSeconds;
  if (!Number.isInteger(duration) || (duration as number) < MIN_DURATION_SECONDS || (duration as number) > MAX_DURATION_SECONDS) {
    throw new Error('INVALID_DURATION');
  }
  if (!Array.isArray(value.bells) || value.bells.length > MAX_NOTIFICATIONS) throw new Error('INVALID_BELLS');
  const bells = value.bells.map(normalizeBell);
  const sorted = [...bells].sort((a, b) => b.remainingSeconds - a.remainingSeconds);
  for (let index = 0; index < sorted.length; index += 1) {
    const bell = sorted[index]!;
    if (bell.remainingSeconds > (duration as number)) throw new Error('BELL_OUT_OF_RANGE');
    if (index > 0 && sorted[index - 1]!.remainingSeconds - bell.remainingSeconds < MIN_NOTIFICATION_GAP_SECONDS) {
      throw new Error('BELL_INTERVAL_TOO_SHORT');
    }
  }
  return { durationSeconds: duration as number, bells: sorted };
}

function normalizeBell(value: unknown): BellPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BELL');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !['remainingSeconds', 'ringCount'].includes(key))) throw new Error('INVALID_BELL');
  if (!Number.isInteger(row.remainingSeconds) || (row.remainingSeconds as number) < 0) throw new Error('INVALID_BELL_TIME');
  if (![1, 2, 3].includes(row.ringCount as number)) throw new Error('INVALID_RING_COUNT');
  return { remainingSeconds: row.remainingSeconds as number, ringCount: row.ringCount as 1 | 2 | 3 };
}
