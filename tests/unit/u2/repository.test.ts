import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import type {
  OperationReceipt,
  PendingOperation,
  TimerSession,
} from '../../../packages/domain/src/index.js';
import { DynamoTimerRepository } from '../../../apps/api/src/timer/dynamo-repository.js';

function makeOperation(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    idempotencyKey: 'op-key',
    sessionId: 'session-1',
    principalId: 'operator',
    route: 'POST#/v1/sessions/{sessionId}/pause',
    expectedVersion: 4,
    requestFingerprint: 'fingerprint',
    leaseToken: 'lease-token',
    leaseExpiresAt: '2026-11-14T10:00:30.000Z',
    ...overrides,
  };
}

function makeSession(): TimerSession {
  return {
    id: 'session-1',
    venueId: 'venue-1',
    version: 5,
    generation: 1,
    state: 'paused',
    settingsSnapshot: { durationSeconds: 60, bells: [] },
    remainingSeconds: 30,
    deadline: null,
    deadlineWake: { status: 'pending', attempt: 2 },
    notifications: [],
    initiatingPrincipalId: 'operator',
    idempotencyKey: 'start-key',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:10.000Z',
    pendingOperation: makeOperation(),
  };
}

const receipt: OperationReceipt = {
  idempotencyKey: 'op-key',
  route: 'POST#/v1/sessions/{sessionId}/pause',
  requestFingerprint: 'fingerprint',
  responseStatus: 200,
  responseBody: { session: { id: 'session-1', state: 'paused', version: 5 } },
  expiresAt: '2026-11-21T10:00:10.000Z',
};

describe('U2 DynamoDB operation persistence', () => {
  it('reads the shared OperationReceipt field names and detects a mismatched request fingerprint', async () => {
    const repository = new DynamoTimerRepository(
      {
        async send() {
          return {
            Item: {
              requestFingerprint: 'fingerprint',
              responseStatus: 200,
              responseBody: { ok: true },
            },
          };
        },
      } as never,
      'table',
    );
    await expect(
      repository.findIdempotent('op-key', receipt.route, 'fingerprint'),
    ).resolves.toEqual({ response: { ok: true }, statusCode: 200 });
    await expect(repository.findIdempotent('op-key', receipt.route, 'different')).resolves.toBe(
      'conflict',
    );
  });

  it('reserves an operation with a version/state guard and puts its lease on the recovery index', async () => {
    let command: unknown;
    const repository = new DynamoTimerRepository(
      {
        async send(value: unknown) {
          command = value;
          return {};
        },
      } as never,
      'table',
    );
    await expect(
      repository.reserveOperation('session-1', 4, 'running', makeOperation()),
    ).resolves.toBe(true);
    expect(command).toBeInstanceOf(UpdateCommand);
    expect((command as UpdateCommand).input).toMatchObject({
      ConditionExpression:
        'version = :version AND #state = :state AND attribute_not_exists(pendingOperation)',
      ExpressionAttributeValues: {
        ':version': 4,
        ':state': 'running',
        ':dueAt': '2026-11-14T10:00:30.000Z',
      },
    });
  });

  it('reports a lost conditional reservation without overwriting the other operation', async () => {
    const repository = new DynamoTimerRepository(
      {
        async send() {
          const error = new Error('conflict');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        },
      } as never,
      'table',
    );
    await expect(
      repository.reserveOperation('session-1', 4, 'running', makeOperation()),
    ).resolves.toBe(false);
  });

  it('commits the state, clears pendingOperation, and stores the shared receipt atomically', async () => {
    let transaction: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository(
      {
        async send(command: unknown) {
          if (command instanceof TransactWriteCommand) transaction = command;
          return {};
        },
      } as never,
      'table',
    );
    const session = makeSession();
    await expect(
      repository.completeOperation(session.id, 4, 'lease-token', session, receipt),
    ).resolves.toBe(true);
    const items = transaction?.input.TransactItems ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]?.Put?.ConditionExpression).toContain('pendingOperation.leaseToken');
    expect(items[0]?.Put?.Item).not.toHaveProperty('pendingOperation');
    expect(items[2]?.Put?.Item).toMatchObject({
      idempotencyKey: 'op-key',
      route: receipt.route,
      requestFingerprint: 'fingerprint',
      responseStatus: 200,
      responseBody: receipt.responseBody,
    });
    expect(items[2]?.Put?.Item?.expiresAt).toBe(Math.floor(Date.parse(receipt.expiresAt) / 1_000));
  });

  it('leaves durable state untouched when the completion transaction loses its condition', async () => {
    const repository = new DynamoTimerRepository(
      {
        async send() {
          const error = new Error('transaction conflict');
          error.name = 'TransactionCanceledException';
          throw error;
        },
      } as never,
      'table',
    );
    await expect(
      repository.completeOperation('session-1', 4, 'lease-token', makeSession(), receipt),
    ).resolves.toBe(false);
  });

  it('requires a running matching session with no pending operation before claiming a notification', async () => {
    let transaction: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository(
      {
        async send(command: unknown) {
          if (command instanceof TransactWriteCommand)
            transaction = command as TransactWriteCommand;
          if (command instanceof GetCommand)
            return { Item: { id: 'notice', status: 'dispatching', generation: 2 } };
          return {};
        },
      } as never,
      'table',
    );
    await expect(
      repository.claimNotification(
        'session-1',
        'notice',
        2,
        '2026-11-14T10:00:00Z',
        '2026-11-14T10:00:10Z',
        'claim',
      ),
    ).resolves.toMatchObject({ status: 'dispatching' });
    expect(transaction?.input.TransactItems?.[0]?.ConditionCheck?.ConditionExpression).toContain(
      'attribute_not_exists(pendingOperation)',
    );
    expect(transaction?.input.TransactItems?.[1]?.Update?.ConditionExpression).toContain(
      'generation = :generation',
    );
  });

  it('guards wake state writes by the generation that registered them', async () => {
    let command: UpdateCommand | undefined;
    const repository = new DynamoTimerRepository(
      {
        async send(value: unknown) {
          command = value as UpdateCommand;
          return {};
        },
      } as never,
      'table',
    );
    await repository.setWakeState(
      'session-1',
      undefined,
      { status: 'registered', attempt: 1 },
      'pending',
      3,
    );
    expect(command?.input.ConditionExpression).toContain('generation = :generation');
    expect(command?.input.ExpressionAttributeValues?.[':generation']).toBe(3);
  });

  it('hydrates a session with notification rows and returns undefined when the metadata row is absent', async () => {
    const repository = new DynamoTimerRepository(
      {
        async send() {
          return {
            Items: [
              { entity: 'session', id: 'session-1', state: 'paused' },
              { entity: 'notification', id: 'bell-1', status: 'pending' },
              { entity: 'other', id: 'ignored' },
            ],
          };
        },
      } as never,
      'table',
    );
    await expect(repository.getSession('session-1')).resolves.toMatchObject({
      id: 'session-1',
      notifications: [{ id: 'bell-1', status: 'pending' }],
    });
    const emptyRepository = new DynamoTimerRepository(
      {
        async send() {
          return { Items: [{ entity: 'notification' }] };
        },
      } as never,
      'table',
    );
    await expect(emptyRepository.getSession('missing')).resolves.toBeUndefined();
  });

  it('creates a session and notification rows in one transaction with replacement guards', async () => {
    let command: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository(
      {
        async send(value: unknown) {
          command = value as TransactWriteCommand;
          return {};
        },
      } as never,
      'table',
    );
    const session = {
      ...makeSession(),
      state: 'running' as const,
      deadline: '2026-11-14T10:01:00.000Z',
      notifications: [
        {
          id: 'bell-1',
          remainingSeconds: 10,
          ringCount: 2 as const,
          status: 'pending' as const,
          generation: 1,
          scheduledAt: '2026-11-14T10:00:50.000Z',
          expiresAt: '2026-11-14T10:00:55.000Z',
          attemptCount: 0,
          dispatchOutcome: 'not_attempted' as const,
          wake: { status: 'pending' as const, attempt: 0 },
        },
      ],
    };
    await repository.createSession(session, 'fp', { id: session.id }, 201);
    const items = command?.input.TransactItems ?? [];
    expect(items).toHaveLength(4);
    expect(items[0]?.Put?.Item).toMatchObject({
      PK: 'SESSION#session-1',
      wakePartition: 'PENDING',
      recoveryPartition: 'ACTIVE',
    });
    expect(items[1]?.Put?.ConditionExpression).toContain('attribute_not_exists(PK)');
    expect(items[3]?.Put?.Item).toMatchObject({ entity: 'notification', notificationId: 'bell-1' });
  });

  it('updates a session and its notifications atomically', async () => {
    let command: TransactWriteCommand | undefined;
    const repository = new DynamoTimerRepository(
      {
        async send(value: unknown) {
          command = value as TransactWriteCommand;
          return {};
        },
      } as never,
      'table',
    );
    const session = { ...makeSession(), pendingOperation: undefined, notifications: [] };
    await repository.updateSession(session);
    expect(command?.input.TransactItems).toHaveLength(2);
    expect(command?.input.TransactItems?.[0]?.Put?.ConditionExpression).toContain(
      'attribute_not_exists(pendingOperation)',
    );
  });

  it('writes notification state and reports conditional conflicts', async () => {
    const successful = new DynamoTimerRepository(
      {
        async send(command: unknown) {
          expect(command).toBeInstanceOf(PutCommand);
          return {};
        },
      } as never,
      'table',
    );
    const notification = {
      id: 'bell-1',
      remainingSeconds: 10,
      ringCount: 1 as const,
      status: 'pending' as const,
      generation: 1,
      scheduledAt: '2026-11-14T10:00:50.000Z',
      expiresAt: '2026-11-14T10:00:55.000Z',
      attemptCount: 0,
      dispatchOutcome: 'not_attempted' as const,
      wake: { status: 'pending' as const, attempt: 0 },
    };
    await expect(successful.updateNotification('session-1', notification, 'pending')).resolves.toBe(
      true,
    );
    const conflicting = new DynamoTimerRepository(
      {
        async send() {
          const error = new Error('condition failed');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        },
      } as never,
      'table',
    );
    await expect(
      conflicting.updateNotification('session-1', notification, 'pending'),
    ).resolves.toBe(false);
  });

  it('loads only due wake and recovery index rows and saves idempotent responses', async () => {
    const commands: unknown[] = [];
    const repository = new DynamoTimerRepository(
      {
        async send(command: unknown) {
          commands.push(command);
          return {
            Items: [
              { sessionId: 'session-1' },
              { sessionId: 'session-2', notificationId: 'bell-1' },
            ],
          };
        },
      } as never,
      'table',
    );
    await expect(repository.dueWakeRegistrations('now', 10)).resolves.toEqual([
      { sessionId: 'session-1', notificationId: undefined },
      { sessionId: 'session-2', notificationId: 'bell-1' },
    ]);
    await expect(repository.dueRecoveryTargets('now', 12)).resolves.toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(QueryCommand);
    expect((commands[0] as QueryCommand).input.IndexName).toBe('WakeIndex');
    expect((commands[1] as QueryCommand).input.IndexName).toBe('RecoveryIndex');
    await repository.saveIdempotent('key', 'route', 'fp', { ok: true }, 201);
    expect(commands[2]).toBeInstanceOf(PutCommand);
  });

  it('marks a publish attempt and converts a lost lease condition into false', async () => {
    const success = new DynamoTimerRepository(
      {
        async send(command: unknown) {
          expect(command).toBeInstanceOf(UpdateCommand);
          return {};
        },
      } as never,
      'table',
    );
    await expect(success.markPublishStarted('session-1', 'bell-1', 'claim', 'now')).resolves.toBe(
      true,
    );
    const stale = new DynamoTimerRepository(
      {
        async send() {
          const error = new Error('lost lease');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        },
      } as never,
      'table',
    );
    await expect(stale.markPublishStarted('session-1', 'bell-1', 'old', 'now')).resolves.toBe(
      false,
    );
  });
});
