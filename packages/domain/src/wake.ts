import { createHash } from 'node:crypto';

export type WakePurpose = 'deadline' | 'notification';

export function deterministicWake(
  targetId: string,
  generation: number,
  purpose: WakePurpose,
  attempt: number,
  input: unknown,
) {
  const name = createHash('sha256')
    .update(`${targetId}:${generation}:${purpose}:${attempt}`)
    .digest('hex')
    .slice(0, 64);
  const serialized = JSON.stringify(input);
  return {
    executionName: `wake-${name}`,
    input: serialized,
    inputHash: createHash('sha256').update(serialized).digest('hex'),
  };
}

export function mergeDispatchOutcome(
  current: 'not_attempted' | 'accepted' | 'rejected' | 'ambiguous',
  next: 'accepted' | 'rejected' | 'ambiguous',
) {
  const rank = { not_attempted: 0, rejected: 1, ambiguous: 2, accepted: 3 } as const;
  return rank[next] > rank[current] ? next : current;
}

export function terminalNotificationStatus(
  outcome: 'not_attempted' | 'accepted' | 'rejected' | 'ambiguous',
  attempted: boolean,
) {
  if (outcome === 'accepted') return 'sent' as const;
  if (outcome === 'ambiguous') return 'unknown' as const;
  if (outcome === 'rejected' && attempted) return 'failed' as const;
  return 'expired' as const;
}
