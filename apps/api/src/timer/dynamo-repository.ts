import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Notification, TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';

type Item = Record<string, unknown>;

export class DynamoTimerRepository implements TimerRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly tableName: string) {}

  async getGrant(principalId: string, venueId: string, permission: 'read' | 'configure' | 'operate') {
    const result = await this.db.send(new GetCommand({ TableName: this.tableName, Key: { PK: `USER#${principalId}`, SK: `VENUE#${venueId}` }, ConsistentRead: true }));
    const permissions = result.Item?.permissions;
    return Array.isArray(permissions) && permissions.includes(permission);
  }

  async getSession(sessionId: string) {
    const result = await this.db.send(new QueryCommand({ TableName: this.tableName, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` }, ConsistentRead: true }));
    return this.hydrate(result.Items ?? []);
  }

  async getActiveSession(venueId: string) {
    const result = await this.db.send(new GetCommand({ TableName: this.tableName, Key: { PK: `VENUE#${venueId}`, SK: 'ACTIVE' }, ConsistentRead: true }));
    if (!result.Item?.sessionId) return undefined;
    return this.getSession(String(result.Item.sessionId));
  }

  async findIdempotent(key: string, route: string, fingerprint: string) {
    const result = await this.db.send(new GetCommand({ TableName: this.tableName, Key: { PK: `IDEMP#${key}`, SK: route }, ConsistentRead: true }));
    if (!result.Item) return undefined;
    if (result.Item.fingerprint !== fingerprint) return 'conflict' as const;
    if (!result.Item.response || !result.Item.statusCode) return { response: undefined, statusCode: 202 };
    return { response: result.Item.response, statusCode: Number(result.Item.statusCode) };
  }

  async createSession(session: TimerSession, fingerprint: string, response: unknown, statusCode: number) {
    const items: Item[] = [
      { PK: `SESSION#${session.id}`, SK: 'META', entity: 'session', sessionId: session.id, wakePartition: 'PENDING', wakeDueAt: session.createdAt, recoveryPartition: 'ACTIVE', recoveryDueAt: session.deadline, ...session },
      { PK: `VENUE#${session.venueId}`, SK: 'ACTIVE', entity: 'active', sessionId: session.id, state: session.state },
      { PK: `IDEMP#${session.idempotencyKey}`, SK: 'POST#/v1/sessions', entity: 'idempotency', fingerprint, response, statusCode, expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400 },
      ...session.notifications.map((notification) => ({ PK: `SESSION#${session.id}`, SK: `NOTIFICATION#${notification.id}`, entity: 'notification', sessionId: session.id, notificationId: notification.id, wakePartition: 'PENDING', wakeDueAt: session.createdAt, recoveryPartition: 'ACTIVE', recoveryDueAt: notification.scheduledAt, ...notification })),
    ];
    const transactItems = items.map((Item) => ({ Put: { TableName: this.tableName, Item: stripUndefined(Item), ConditionExpression: 'attribute_not_exists(PK)' } })) as NonNullable<TransactWriteCommandInput['TransactItems']>;
    transactItems[1] = { Put: { TableName: this.tableName, Item: items[1]!, ConditionExpression: 'attribute_not_exists(PK) OR #state IN (:completed, :cancelled)', ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':completed': 'completed', ':cancelled': 'cancelled' } } };
      await this.db.send(new TransactWriteCommand({ TransactItems: transactItems }));
  }

  async updateSession(session: TimerSession) {
    const transactItems = [
      { Put: { TableName: this.tableName, Item: stripUndefined({ PK: `SESSION#${session.id}`, SK: 'META', entity: 'session', recoveryPartition: session.state === 'running' ? 'ACTIVE' : 'DONE', recoveryDueAt: session.deadline ?? '9999-12-31T23:59:59.999Z', ...session }), ConditionExpression: 'version = :oldVersion', ExpressionAttributeValues: { ':oldVersion': session.version - 1 } } },
      { Update: { TableName: this.tableName, Key: { PK: `VENUE#${session.venueId}`, SK: 'ACTIVE' }, UpdateExpression: 'SET #state = :state', ConditionExpression: 'sessionId = :sessionId', ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':state': session.state, ':sessionId': session.id } } },
      ...session.notifications.map((notification) => ({ Put: { TableName: this.tableName, Item: stripUndefined({ PK: `SESSION#${session.id}`, SK: `NOTIFICATION#${notification.id}`, entity: 'notification', ...notification }) } })),
    ];
    await this.db.send(new TransactWriteCommand({ TransactItems: transactItems }));
  }

  async updateNotification(sessionId: string, notification: Notification, expectedStatus: string) {
    try {
      const isTerminal = ['sent', 'failed', 'expired', 'cancelled', 'unknown'].includes(notification.status);
      const isWakePending = notification.wake.status !== 'registered';
      await this.db.send(new PutCommand({ TableName: this.tableName, Item: stripUndefined({
        PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notification.id}`, entity: 'notification', sessionId, notificationId: notification.id,
        wakePartition: isWakePending ? 'PENDING' : 'DONE', wakeDueAt: new Date().toISOString(),
        recoveryPartition: isTerminal ? 'DONE' : 'ACTIVE',
        recoveryDueAt: notification.status === 'dispatching' ? notification.expiresAt : notification.scheduledAt,
        ...notification,
      }), ConditionExpression: '#status = :expected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':expected': expectedStatus } }));
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async setWakeState(sessionId: string, notificationId: string | undefined, wake: Notification['wake'], previousStatus: string) {
    const key = { PK: `SESSION#${sessionId}`, SK: notificationId ? `NOTIFICATION#${notificationId}` : 'META' };
    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName, Key: key,
        UpdateExpression: 'SET #wake = :wake, wakePartition = :partition, wakeDueAt = :dueAt',
        ConditionExpression: '#wake.#status = :previous',
        ExpressionAttributeNames: { '#wake': notificationId ? 'wake' : 'deadlineWake', '#status': 'status' },
        ExpressionAttributeValues: { ':wake': stripUndefined(wake), ':previous': previousStatus, ':partition': wake.status === 'registered' ? 'DONE' : 'PENDING', ':dueAt': wake.status === 'registered' ? '9999-12-31T23:59:59.999Z' : new Date().toISOString() },
      }));
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async claimNotification(sessionId: string, notificationId: string, generation: number, now: string, leaseUntil: string, claimToken: string) {
    try {
      const result = await this.db.send(new UpdateCommand({
        TableName: this.tableName, Key: { PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notificationId}` },
        UpdateExpression: 'SET #status = :dispatching, claimToken = :token, claimExpiresAt = :lease, updatedAt = :now',
        ConditionExpression: '((#status = :pending) OR (#status = :dispatching AND claimExpiresAt <= :now)) AND generation = :generation AND scheduledAt <= :now AND expiresAt > :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':dispatching': 'dispatching', ':pending': 'pending', ':token': claimToken, ':lease': leaseUntil, ':now': now, ':generation': generation },
        ReturnValues: 'ALL_NEW',
      }));
      return this.notification(result.Attributes as Item);
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return undefined;
      throw error;
    }
  }

  async markPublishStarted(sessionId: string, notificationId: string, claimToken: string, startedAt: string) {
    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName, Key: { PK: `SESSION#${sessionId}`, SK: `NOTIFICATION#${notificationId}` },
        UpdateExpression: 'SET publishStartedAt = if_not_exists(publishStartedAt, :startedAt)',
        ConditionExpression: '#status = :dispatching AND claimToken = :claimToken',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':startedAt': startedAt, ':dispatching': 'dispatching', ':claimToken': claimToken },
      }));
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async dueWakeRegistrations(now: string, limit = 100) {
    const result = await this.db.send(new QueryCommand({ TableName: this.tableName, IndexName: 'WakeIndex', KeyConditionExpression: 'wakePartition = :partition AND wakeDueAt <= :now', ExpressionAttributeValues: { ':partition': 'PENDING', ':now': now }, Limit: limit }));
    return (result.Items ?? []).map((item) => ({ sessionId: String(item.sessionId), notificationId: item.notificationId ? String(item.notificationId) : undefined }));
  }

  async dueRecoveryTargets(now: string, limit = 100) {
    const result = await this.db.send(new QueryCommand({ TableName: this.tableName, IndexName: 'RecoveryIndex', KeyConditionExpression: 'recoveryPartition = :partition AND recoveryDueAt <= :now', ExpressionAttributeValues: { ':partition': 'ACTIVE', ':now': now }, Limit: limit }));
    return (result.Items ?? []).map((item) => ({ sessionId: String(item.sessionId), notificationId: item.notificationId ? String(item.notificationId) : undefined }));
  }

  async saveIdempotent(key: string, route: string, fingerprint: string, response: unknown, statusCode: number) {
    await this.db.send(new PutCommand({ TableName: this.tableName, Item: { PK: `IDEMP#${key}`, SK: route, entity: 'idempotency', fingerprint, response, statusCode, expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400 } }));
  }

  private hydrate(items: Item[]): TimerSession | undefined {
    const meta = items.find((item) => item.entity === 'session');
    if (!meta) return undefined;
    return { ...meta, notifications: items.filter((item) => item.entity === 'notification').map((item) => this.notification(item)) } as unknown as TimerSession;
  }

  private notification(item: Item): Notification { const { PK, SK, entity, ...fields } = item; return fields as unknown as Notification; }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, stripUndefined(entry)])) as T;
  }
  return value;
}
