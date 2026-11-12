import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import type { TimerSession } from '../../../packages/domain/src/index.js';
import { DynamoTimerRepository } from '../../../apps/api/src/timer/dynamo-repository.js';

describe('U1 DynamoDB repository access control and latest session', () => {
  it('allows only the permission present in a venue grant', async () => {
    const repository = new DynamoTimerRepository({ async send(command: unknown) {
      expect(command).toBeInstanceOf(GetCommand);
      return { Item: { permissions: ['read'] } };
    } } as never, 'table');

    await expect(repository.getGrant('viewer', 'venue-1', 'read')).resolves.toBe(true);
    await expect(repository.getGrant('viewer', 'venue-1', 'operate')).resolves.toBe(false);
  });

  it('returns the completed latest session pointed to by the venue record', async () => {
    const completed: TimerSession = {
      id: 'session-done', venueId: 'venue-1', version: 2, generation: 1, state: 'completed',
      settingsSnapshot: { durationSeconds: 60, bells: [] }, remainingSeconds: 0, deadline: null,
      deadlineWake: { status: 'registered', attempt: 0 }, notifications: [], initiatingPrincipalId: 'operator',
      idempotencyKey: 'key', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:01:00.000Z',
    };
    const repository = new DynamoTimerRepository({ async send(command: unknown) {
      if (command instanceof GetCommand) return { Item: { sessionId: completed.id } };
      expect(command).toBeInstanceOf(QueryCommand);
      return { Items: [{ PK: `SESSION#${completed.id}`, SK: 'META', entity: 'session', ...completed }] };
    } } as never, 'table');

    await expect(repository.getActiveSession('venue-1')).resolves.toMatchObject({ id: completed.id, state: 'completed' });
  });
});
