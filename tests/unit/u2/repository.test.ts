import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import type { OperationReceipt, PendingOperation, TimerSession } from '../../../packages/domain/src/index.js';
import { DynamoTimerRepository } from '../../../apps/api/src/timer/dynamo-repository.js';

function makeOperation(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    idempotencyKey: 'op-key', sessionId: 'session-1', principalId: 'operator', route: 'POST#/v1/sessions/{sessionId}/pause',
    expectedVersion: 4, requestFingerprint: 'fingerprint', leaseToken: 'lease-token', leaseExpiresAt: '2026-11-14T10:00:30.000Z', ...overrides,
  };
}

function makeSession(): TimerSession {
  return {
    id: 'session-1', venueId: 'venue-1', version: 5, generation: 1, state: 'paused', settingsSnapshot: { durationSeconds: 60, bells: [] },
    remainingSeconds: 30, deadline: null, deadlineWake: { status: 'pending', attempt: 2 }, notifications: [], initiatingPrincipalId: 'operator',
    idempotencyKey: 'start-key', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:00:10.000Z', pendingOperation: makeOperation(),
  };
}

const receipt: OperationReceipt = {
  idempotencyKey: 'op-key', route: 'POST#/v1/sessions/{sessionId}/pause', requestFingerprint: 'fingerprint',
  responseStatus: 200, responseBody: { session: { id: 'session-1', state: 'paused', version: 5 } }, expiresAt: '2026-11-21T10:00:10.000Z',
};

describe('U2 DynamoDB operation persistence', () => {
  it('reads the shared OperationReceipt field names and detects a mismatched request fingerprint', async () => {
    const repository = new DynamoTimerRepository({ async send() { return { Item: { requestFingerprint: 'fingerprint', responseStatus: 200, responseBody: { ok: true } } }; } } as never, 'table');
    await expect(repository.findIdempotent('op-key', receipt.route, 'fingerprint')).resolves.toEqual({ response: { ok: true }, statusCode: 200 });
    await expect(repository.findIdempotent('op-key', receipt.route, 'different')).resolves.toBe('conflict');
  });

  it('reserves an operation with a version/state guard and puts its lease on the recovery index', async () => {
    let command: unknown;
    const repository = new DynamoTimerRepository({ async send(value: unknown) { command = value; return {}; } } as never, 'table');
    await expect(repository.reserveOperation('session-1', 4, 'running', makeOperation())).resolves.toBe(true);
    expect(command).toBeInstanceOf(UpdateCommand);
    expect((command as UpdateCommand).input).toMatchObject({
      ConditionExpression: 'version = :version AND #state = :state AND attribute_not_exists(pendingOperation)',
      ExpressionAttributeValues: { ':version': 4, ':state': 'running', ':dueAt': '2026-11-14T10:00:30.000Z' },
    });
  });

  it('reports a lost conditional reservation without overwriting the other operation', async () => {
    const repository = new DynamoTimerRepository({ async send() { const error = new Error('conflict'); error.name = 'ConditionalCheckFailedException'; throw error; } } as never, 'table');
    await expect(repository.reserveOperation('session-1', 4, 'running', makeOperation())).resolves.toBe(false);
  });

  it('commits the state, clears pendingOperation, and stores the shared receipt atomically', async () => {
    let transaction: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository({ async send(command: unknown) { if (command instanceof TransactWriteCommand) transaction = command; return {}; } } as never, 'table');
    const session = makeSession();
    await expect(repository.completeOperation(session.id, 4, 'lease-token', session, receipt)).resolves.toBe(true);
    const items = transaction?.input.TransactItems ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]?.Put?.ConditionExpression).toContain('pendingOperation.leaseToken');
    expect(items[0]?.Put?.Item).not.toHaveProperty('pendingOperation');
    expect(items[2]?.Put?.Item).toMatchObject({ idempotencyKey: 'op-key', route: receipt.route, requestFingerprint: 'fingerprint', responseStatus: 200, responseBody: receipt.responseBody });
    expect(items[2]?.Put?.Item?.expiresAt).toBe(Math.floor(Date.parse(receipt.expiresAt) / 1_000));
  });

  it('leaves durable state untouched when the completion transaction loses its condition', async () => {
    const repository = new DynamoTimerRepository({ async send() { const error = new Error('transaction conflict'); error.name = 'TransactionCanceledException'; throw error; } } as never, 'table');
    await expect(repository.completeOperation('session-1', 4, 'lease-token', makeSession(), receipt)).resolves.toBe(false);
  });

  it('requires a running matching session with no pending operation before claiming a notification', async () => {
    let transaction: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository({ async send(command: unknown) {
      if (command instanceof TransactWriteCommand) transaction = command as TransactWriteCommand;
      if (command instanceof GetCommand) return { Item: { id: 'notice', status: 'dispatching', generation: 2 } };
      return {};
    } } as never, 'table');
    await expect(repository.claimNotification('session-1', 'notice', 2, '2026-11-14T10:00:00Z', '2026-11-14T10:00:10Z', 'claim')).resolves.toMatchObject({ status: 'dispatching' });
    expect(transaction?.input.TransactItems?.[0]?.ConditionCheck?.ConditionExpression).toContain('attribute_not_exists(pendingOperation)');
    expect(transaction?.input.TransactItems?.[1]?.Update?.ConditionExpression).toContain('generation = :generation');
  });

  it('guards wake state writes by the generation that registered them', async () => {
    let command: UpdateCommand | undefined;
    const repository = new DynamoTimerRepository({ async send(value: unknown) { command = value as UpdateCommand; return {}; } } as never, 'table');
    await repository.setWakeState('session-1', undefined, { status: 'registered', attempt: 1 }, 'pending', 3);
    expect(command?.input.ConditionExpression).toContain('generation = :generation');
    expect(command?.input.ExpressionAttributeValues?.[':generation']).toBe(3);
  });
});
