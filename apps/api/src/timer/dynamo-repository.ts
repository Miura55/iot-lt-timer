import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type {
  Notification,
  OperationReceipt,
  PendingOperation,
  SessionState,
  TimerSession,
} from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';

type Item = Record<string, unknown>;

export class DynamoTimerRepository implements TimerRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getGrant(
    principalId: string,
    venueId: string,
    permission: 'read' | 'configure' | 'operate',
  ) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${principalId}`, SK: `VENUE#${venueId}` },
        ConsistentRead: true,
      }),
    );
    const permissions = result.Item?.permissions;
    return Array.isArray(permissions) && permissions.includes(permission);
  }

  async getSession(sessionId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
        ConsistentRead: true,
      }),
    );
    return this.hydrate(result.Items ?? []);
  }

  async getActiveSession(venueId: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `VENUE#${venueId}`, SK: 'ACTIVE' },
        ConsistentRead: true,
      }),
    );
    if (!result.Item?.sessionId) return undefined;
    return this.getSession(String(result.Item.sessionId));
  }

  async findIdempotent(key: string, route: string, fingerprint: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `IDEMP#${key}`, SK: route },
        ConsistentRead: true,
      }),
    );
    if (!result.Item) return undefined;
    if ((result.Item.requestFingerprint ?? result.Item.fingerprint) !== fingerprint)
      return 'conflict' as const;
    const response = result.Item.responseBody ?? result.Item.response;
    const statusCode = result.Item.responseStatus ?? result.Item.statusCode;
    if (statusCode === undefined) return { response: undefined, statusCode: 409 };
    return { response, statusCode: Number(statusCode) };
  }

  async createSession(
    session: TimerSession,
    fingerprint: string,
    response: unknown,
    statusCode: number,
  ) {
    const items: Item[] = [
      {
        PK: `SESSION#${session.id}`,
        SK: 'META',
        entity: 'session',
        sessionId: session.id,
        wakePartition:
          session.deadlineWake.status === 'registered' || !session.deadline ? 'DONE' : 'PENDING',
        wakeDueAt: session.deadline ?? session.createdAt,
        recoveryPartition: session.state === 'running' ? 'ACTIVE' : 'DONE',
        recoveryDueAt: recoveryDueAt(session),
        ...session,
      },
      {
        PK: `VENUE#${session.venueId}`,
        SK: 'ACTIVE',
        entity: 'active',
        sessionId: session.id,
        state: session.state,
      },
      {
        PK: `IDEMP#${session.idempotencyKey}`,
        SK: 'POST#/v1/sessions',
        entity: 'idempotency',
        idempotencyKey: session.idempotencyKey,
        route: 'POST#/v1/sessions',
        requestFingerprint: fingerprint,
        responseBody: response,
        responseStatus: statusCode,
        expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400,
      },
      ...session.notifications.map((notification) => ({
        PK: `SESSION#${session.id}`,
        SK: `NOTIFICATION#${notification.id}`,
        entity: 'notification',
        sessionId: session.id,
        notificationId: notification.id,
        wakePartition: 'PENDING',
        wakeDueAt: session.createdAt,
        recoveryPartition: 'ACTIVE',
        recoveryDueAt: notification.scheduledAt,
        ...notification,
      })),
    ];
    const transactItems = items.map((Item) => ({
      Put: {
        TableName: this.tableName,
        Item: stripUndefined(Item),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    })) as NonNullable<TransactWriteCommandInput['TransactItems']>;
    transactItems[1] = {
      Put: {
        TableName: this.tableName,
        Item: items[1]!,
        ConditionExpression: 'attribute_not_exists(PK) OR #state IN (:completed, :cancelled)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':completed': 'completed', ':cancelled': 'cancelled' },
      },
    };
    await this.db.send(new TransactWriteCommand({ TransactItems: transactItems }));
  }

  async updateSession(session: TimerSession) {
    const transactItems = [
      {
        Put: {
          TableName: this.tableName,
          Item: stripUndefined({
            PK: `SESSION#${session.id}`,
            SK: 'META',
            entity: 'session',
            sessionId: session.id,
            wakePartition:
              session.deadlineWake.status === 'registered' || !session.deadline
                ? 'DONE'
                : 'PENDING',
            wakeDueAt: session.deadline ?? session.updatedAt,
            recoveryPartition:
              session.state === 'running' || session.pendingOperation ? 'ACTIVE' : 'DONE',
            recoveryDueAt: recoveryDueAt(session),
            ...session,
          }),
          ConditionExpression: 'version = :oldVersion AND attribute_not_exists(pendingOperation)',
          ExpressionAttributeValues: { ':oldVersion': session.version - 1 },
        },
      },
      {
        Update: {
          TableName: this.tableName,
          Key: { PK: `VENUE#${session.venueId}`, SK: 'ACTIVE' },
          UpdateExpression: 'SET #state = :state',
          ConditionExpression: 'sessionId = :sessionId',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: { ':state': session.state, ':sessionId': session.id },
        },
      },
      ...session.notifications.map((notification) => ({
        Put: {
          TableName: this.tableName,
          Item: stripUndefined({
            PK: `SESSION#${session.id}`,
            SK: `NOTIFICATION#${notification.id}`,
            entity: 'notification',
            ...notification,
          }),
        },
      })),
    ];
    await this.db.send(new TransactWriteCommand({ TransactItems: transactItems }));
  }

  async reserveOperation(
    sessionId: string,
    expectedVersion: number,
    expectedState: SessionState,
    pending: PendingOperation,
  ) {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: `SESSION#${sessionId}`, SK: 'META' },
          UpdateExpression:
            'SET pendingOperation = :pending, recoveryPartition = :active, recoveryDueAt = :dueAt',
          ConditionExpression:
            'version = :version AND #state = :state AND attribute_not_exists(pendingOperation)',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':pending': pending,
            ':active': 'ACTIVE',
            ':dueAt': pending.leaseExpiresAt,
            ':version': expectedVersion,
            ':state': expectedState,
          },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async completeOperation(
    sessionId: string,
    expectedVersion: number,
    leaseToken: string,
    session: TimerSession,
    receipt: OperationReceipt,
  ) {
    const resume = session.pendingOperation?.route.endsWith('/resume') ?? false;
    const changedNotifications =
      session.state === 'cancelled'
        ? session.notifications.filter((notification) => notification.status === 'cancelled')
        : session.notifications.filter((notification) => notification.status === 'pending');
    const notificationWrites = changedNotifications.map((notification) => {
      const oldStatus = 'pending';
      const oldGeneration = resume ? session.generation - 1 : session.generation;
      return {
        Put: {
          TableName: this.tableName,
          Item: stripUndefined(this.notificationItem(session.id, notification)),
          ConditionExpression: '#status = :oldStatus AND generation = :oldGeneration',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':oldStatus': oldStatus, ':oldGeneration': oldGeneration },
        },
      };
    });
    const receiptItem = {
      PK: `IDEMP#${receipt.idempotencyKey}`,
      SK: receipt.route,
      entity: 'idempotency',
      ...receipt,
      expiresAt: Math.floor(Date.parse(receipt.expiresAt) / 1_000),
    };
    const sessionItem = stripUndefined({
      PK: `SESSION#${session.id}`,
      SK: 'META',
      entity: 'session',
      sessionId: session.id,
      wakePartition:
        session.deadlineWake.status === 'registered' || !session.deadline ? 'DONE' : 'PENDING',
      wakeDueAt: session.deadline ?? session.updatedAt,
      recoveryPartition: session.state === 'running' ? 'ACTIVE' : 'DONE',
      recoveryDueAt: recoveryDueAt({ ...session, pendingOperation: undefined }),
      ...session,
      pendingOperation: undefined,
    });
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: sessionItem,
                ConditionExpression:
                  'version = :oldVersion AND pendingOperation.leaseToken = :leaseToken',
                ExpressionAttributeValues: {
                  ':oldVersion': expectedVersion,
                  ':leaseToken': leaseToken,
                },
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: `VENUE#${session.venueId}`, SK: 'ACTIVE' },
                UpdateExpression: 'SET #state = :state',
                ConditionExpression: 'sessionId = :sessionId',
                ExpressionAttributeNames: { '#state': 'state' },
                ExpressionAttributeValues: { ':state': session.state, ':sessionId': session.id },
              },
            },
            ...notificationWrites,
            {
              Put: {
                TableName: this.tableName,
                Item: stripUndefined(receiptItem),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (
        (error as { name?: string }).name === 'ConditionalCheckFailedException' ||
        (error as { name?: string }).name === 'TransactionCanceledException'
      )
        return false;
      throw error;
    }
  }

  async updateNotification(sessionId: string, notification: Notification, expectedStatus: string) {
    try {
      const isTerminal = ['sent', 'failed', 'expired', 'cancelled', 'unknown'].includes(
        notification.status,
      );
      const isWakePending =
        notification.wake.status !== 'registered' && Boolean(notification.scheduledAt);
      await this.db.send(
        new PutCommand({
          TableName: this.tableName,
          Item: stripUndefined({
            PK: `SESSION#${sessionId}`,
            SK: `NOTIFICATION#${notification.id}`,
            entity: 'notification',
            sessionId,
            notificationId: notification.id,
            wakePartition: isWakePending ? 'PENDING' : 'DONE',
            wakeDueAt: new Date().toISOString(),
            recoveryPartition: isTerminal ? 'DONE' : 'ACTIVE',
            recoveryDueAt:
              notification.status === 'dispatching'
                ? notification.expiresAt
                : notification.scheduledAt,
            ...notification,
          }),
          ConditionExpression: '#status = :expected',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':expected': expectedStatus },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async setWakeState(
    sessionId: string,
    notificationId: string | undefined,
    wake: Notification['wake'],
    previousStatus: string,
    generation: number,
  ) {
    const key = {
      PK: `SESSION#${sessionId}`,
      SK: notificationId ? `NOTIFICATION#${notificationId}` : 'META',
    };
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression: 'SET #wake = :wake, wakePartition = :partition, wakeDueAt = :dueAt',
          ConditionExpression: '#wake.#status = :previous AND generation = :generation',
          ExpressionAttributeNames: {
            '#wake': notificationId ? 'wake' : 'deadlineWake',
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':wake': stripUndefined(wake),
            ':previous': previousStatus,
            ':partition': wake.status === 'registered' ? 'DONE' : 'PENDING',
            ':dueAt':
              wake.status === 'registered' ? '9999-12-31T23:59:59.999Z' : new Date().toISOString(),
            ':generation': generation,
          },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async claimNotification(
    sessionId: string,
    notificationId: string,
    generation: number,
    now: string,
    leaseUntil: string,
    claimToken: string,
  ) {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: this.tableName,
                Key: { PK: `SESSION#${sessionId}`, SK: 'META' },
                ConditionExpression:
                  '#state = :running AND generation = :generation AND attribute_not_exists(pendingOperation)',
                ExpressionAttributeNames: { '#state': 'state' },
                ExpressionAttributeValues: { ':running': 'running', ':generation': generation },
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notificationId}` },
                UpdateExpression:
                  'SET #status = :dispatching, claimToken = :token, claimExpiresAt = :lease, updatedAt = :now',
                ConditionExpression:
                  '((#status = :pending) OR (#status = :dispatching AND claimExpiresAt <= :now)) AND generation = :generation AND scheduledAt <= :now AND expiresAt > :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':dispatching': 'dispatching',
                  ':pending': 'pending',
                  ':token': claimToken,
                  ':lease': leaseUntil,
                  ':now': now,
                  ':generation': generation,
                },
              },
            },
          ],
        }),
      );
      const result = await this.db.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notificationId}` },
          ConsistentRead: true,
        }),
      );
      return result.Item ? this.notification(result.Item) : undefined;
    } catch (error) {
      if (
        (error as { name?: string }).name === 'ConditionalCheckFailedException' ||
        (error as { name?: string }).name === 'TransactionCanceledException'
      )
        return undefined;
      throw error;
    }
  }

  async markPublishStarted(
    sessionId: string,
    notificationId: string,
    claimToken: string,
    startedAt: string,
  ) {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notificationId}` },
          UpdateExpression: 'SET publishStartedAt = if_not_exists(publishStartedAt, :startedAt)',
          ConditionExpression: '#status = :dispatching AND claimToken = :claimToken',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':startedAt': startedAt,
            ':dispatching': 'dispatching',
            ':claimToken': claimToken,
          },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async dueWakeRegistrations(now: string, limit = 100) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'WakeIndex',
        KeyConditionExpression: 'wakePartition = :partition AND wakeDueAt <= :now',
        ExpressionAttributeValues: { ':partition': 'PENDING', ':now': now },
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => ({
      sessionId: String(item.sessionId),
      notificationId: item.notificationId ? String(item.notificationId) : undefined,
    }));
  }

  async dueRecoveryTargets(now: string, limit = 100) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'RecoveryIndex',
        KeyConditionExpression: 'recoveryPartition = :partition AND recoveryDueAt <= :now',
        ExpressionAttributeValues: { ':partition': 'ACTIVE', ':now': now },
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => ({
      sessionId: String(item.sessionId),
      notificationId: item.notificationId ? String(item.notificationId) : undefined,
    }));
  }

  async saveIdempotent(
    key: string,
    route: string,
    fingerprint: string,
    response: unknown,
    statusCode: number,
  ) {
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `IDEMP#${key}`,
          SK: route,
          entity: 'idempotency',
          idempotencyKey: key,
          route,
          requestFingerprint: fingerprint,
          responseBody: response,
          responseStatus: statusCode,
          expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400,
        },
      }),
    );
  }

  private hydrate(items: Item[]): TimerSession | undefined {
    const meta = items.find((item) => item.entity === 'session');
    if (!meta) return undefined;
    return {
      ...meta,
      notifications: items
        .filter((item) => item.entity === 'notification')
        .map((item) => this.notification(item)),
    } as unknown as TimerSession;
  }

  private notification(item: Item): Notification {
    const { PK, SK, entity, ...fields } = item;
    return fields as unknown as Notification;
  }

  private notificationItem(sessionId: string, notification: Notification): Item {
    const active = notification.status === 'pending' || notification.status === 'dispatching';
    return {
      PK: `SESSION#${sessionId}`,
      SK: `NOTIFICATION#${notification.id}`,
      entity: 'notification',
      sessionId,
      notificationId: notification.id,
      wakePartition:
        notification.wake.status !== 'registered' && notification.scheduledAt ? 'PENDING' : 'DONE',
      wakeDueAt: notification.scheduledAt ?? '9999-12-31T23:59:59.999Z',
      recoveryPartition: active ? 'ACTIVE' : 'DONE',
      recoveryDueAt:
        notification.status === 'dispatching'
          ? (notification.claimExpiresAt ?? notification.expiresAt ?? '9999-12-31T23:59:59.999Z')
          : (notification.expiresAt ?? notification.scheduledAt ?? '9999-12-31T23:59:59.999Z'),
      ...notification,
    };
  }
}

function recoveryDueAt(session: TimerSession): string {
  const candidates = [
    session.state === 'running' ? session.deadline : null,
    session.pendingOperation?.leaseExpiresAt,
  ].filter((value): value is string => Boolean(value));
  return candidates.sort()[0] ?? '9999-12-31T23:59:59.999Z';
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    ) as T;
  }
  return value;
}
