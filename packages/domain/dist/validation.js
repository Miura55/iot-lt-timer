export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 10_800;
export const MAX_NOTIFICATIONS = 10;
export const MIN_NOTIFICATION_GAP_SECONDS = 2;
export function validateSettings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('INVALID_SETTINGS');
    const value = input;
    if (Object.keys(value).some((key) => !['durationSeconds', 'bells'].includes(key)))
        throw new Error('INVALID_SETTINGS');
    const duration = value.durationSeconds;
    if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
        throw new Error('INVALID_DURATION');
    }
    if (!Array.isArray(value.bells) || value.bells.length > MAX_NOTIFICATIONS)
        throw new Error('INVALID_BELLS');
    const bells = value.bells.map(normalizeBell);
    const sorted = [...bells].sort((a, b) => b.remainingSeconds - a.remainingSeconds);
    for (let index = 0; index < sorted.length; index += 1) {
        const bell = sorted[index];
        if (bell.remainingSeconds > duration)
            throw new Error('BELL_OUT_OF_RANGE');
        if (index > 0 && sorted[index - 1].remainingSeconds - bell.remainingSeconds < MIN_NOTIFICATION_GAP_SECONDS) {
            throw new Error('BELL_INTERVAL_TOO_SHORT');
        }
    }
    return { durationSeconds: duration, bells: sorted };
}
function normalizeBell(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_BELL');
    const row = value;
    if (Object.keys(row).some((key) => !['remainingSeconds', 'ringCount'].includes(key)))
        throw new Error('INVALID_BELL');
    if (!Number.isInteger(row.remainingSeconds) || row.remainingSeconds < 0)
        throw new Error('INVALID_BELL_TIME');
    if (![1, 2, 3].includes(row.ringCount))
        throw new Error('INVALID_RING_COUNT');
    return { remainingSeconds: row.remainingSeconds, ringCount: row.ringCount };
}
//# sourceMappingURL=validation.js.map