import { createHash } from 'node:crypto';
export function deterministicWake(targetId, generation, purpose, attempt, input) {
    const name = createHash('sha256').update(`${targetId}:${generation}:${purpose}:${attempt}`).digest('hex').slice(0, 64);
    const serialized = JSON.stringify(input);
    return { executionName: `wake-${name}`, input: serialized, inputHash: createHash('sha256').update(serialized).digest('hex') };
}
export function mergeDispatchOutcome(current, next) {
    const rank = { not_attempted: 0, rejected: 1, ambiguous: 2, accepted: 3 };
    return rank[next] > rank[current] ? next : current;
}
export function terminalNotificationStatus(outcome, attempted) {
    if (outcome === 'accepted')
        return 'sent';
    if (outcome === 'ambiguous')
        return 'unknown';
    if (outcome === 'rejected' && attempted)
        return 'failed';
    return 'expired';
}
//# sourceMappingURL=wake.js.map