import { PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { describe, expect, it, vi } from 'vitest';
import type { Notification, TimerSession } from '../../../packages/domain/src/index.js';
import { buildSession } from '../../../apps/api/src/timer/service.js';
import {
  AwsIotBellPublisher,
  createDispatcher,
  createMockPublisher,
} from '../../../apps/api/src/timer/dispatcher.js';
import type { TimerRepository } from '../../../apps/api/src/timer/repository.js';

function setup(overrides: Partial<Notification> = {}) {
  const now = new Date('2026-11-14T10:00:00.000Z');
  const session = buildSession({
    id: 'session-1',
    venueId: 'venue-1',
    principalId: 'operator',
    key: 'key',
    input: { settings: { durationSeconds: 60, bells: [{ remainingSeconds: 60, ringCount: 1 }] } },
    now,
  });
  const original = session.notifications[0]!;
  session.notifications[0] = {
    ...original,
    scheduledAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5_000).toISOString(),
    ...overrides,
  };
  let stored = session;
  const repository = {
    async getSession() {
      return stored;
    },
    async claimNotification(
      _sessionId: string,
      _notificationId: string,
      _generation: number,
      _time: string,
      lease: string,
      token: string,
    ) {
      const row = stored.notifications[0]!;
      if (
        row.status === 'dispatching' &&
        row.claimExpiresAt &&
        Date.parse(row.claimExpiresAt) > now.getTime()
      )
        return undefined;
      const claimed = {
        ...row,
        status: 'dispatching' as const,
        claimToken: token,
        claimExpiresAt: lease,
      };
      stored = { ...stored, notifications: [claimed] };
      return claimed;
    },
    async markPublishStarted(_sessionId: string, _id: string, _token: string, startedAt: string) {
      stored = {
        ...stored,
        notifications: [{ ...stored.notifications[0]!, publishStartedAt: startedAt }],
      };
      return true;
    },
    async updateNotification(_sessionId: string, notification: Notification) {
      stored = { ...stored, notifications: [notification] };
      return true;
    },
    async updateSession(next: TimerSession) {
      stored = next;
    },
  } as unknown as TimerRepository;
  return { now, session, repository, read: () => stored };
}

describe('U1 dispatcher recovery', () => {
  it('publishes the exact command topic with QoS 1 and retain disabled', async () => {
    const sent: PublishCommand[] = [];
    const client = {
      async send(command: PublishCommand) {
        sent.push(command);
        return {};
      },
    };
    const publisher = new AwsIotBellPublisher(async () => client as never);
    await expect(
      publisher.publish('lt-timer/v1/dev/bells/bell-1/commands', '{"commandId":"n1"}'),
    ).resolves.toBe('accepted');
    expect(sent[0]?.input).toMatchObject({
      topic: 'lt-timer/v1/dev/bells/bell-1/commands',
      qos: 1,
      retain: false,
    });
    expect(new TextDecoder().decode(sent[0]?.input.payload as Uint8Array)).toBe(
      '{"commandId":"n1"}',
    );
  });

  it('surfaces AWS publish errors without logging the payload', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = {
      async send() {
        throw Object.assign(new Error('denied'), {
          name: 'ForbiddenException',
          $metadata: { httpStatusCode: 403, requestId: 'req-1' },
        });
      },
    };
    const publisher = new AwsIotBellPublisher(async () => client as never);
    await expect(
      publisher.publish('lt-timer/v1/dev/bells/bell-1/commands', 'secret-payload'),
    ).resolves.toBe('rejected');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('ForbiddenException');
    expect(log.mock.calls[0]?.[0]).not.toContain('secret-payload');
    log.mockRestore();
  });

  it('reclaims an expired lease only when publishing never started, retaining command id', async () => {
    const state = setup({
      status: 'dispatching',
      claimExpiresAt: '2026-11-14T09:59:59.000Z',
      claimToken: 'old',
    });
    const publisher = createMockPublisher();
    const dispatch = createDispatcher(state.repository, publisher, {
      venueId: 'venue-1',
      topic: 'bell/test',
      now: () => state.now,
    });
    const result = await dispatch({
      sessionId: 'session-1',
      generation: 1,
      purpose: 'notification',
      notificationId: state.session.notifications[0]!.id,
    });
    expect(result.outcome).toBe('sent');
    expect(publisher.messages[0]?.command).toMatchObject({
      commandId: state.session.notifications[0]!.id,
    });
    expect(state.read().notifications[0]?.attemptCount).toBe(1);
  });

  it('records unknown after a started publish lease expires and never republishes', async () => {
    const state = setup({
      status: 'dispatching',
      claimExpiresAt: '2026-11-14T09:59:59.000Z',
      publishStartedAt: '2026-11-14T09:59:50.000Z',
    });
    const publisher = createMockPublisher();
    const dispatch = createDispatcher(state.repository, publisher, {
      venueId: 'venue-1',
      topic: 'bell/test',
      now: () => state.now,
    });
    const result = await dispatch({
      sessionId: 'session-1',
      generation: 1,
      purpose: 'notification',
      notificationId: state.session.notifications[0]!.id,
    });
    expect(result.outcome).toBe('unknown');
    expect(publisher.messages).toHaveLength(0);
  });

  it('classifies an expired publish-started record with no outcome as unknown', async () => {
    const state = setup({
      status: 'dispatching',
      claimExpiresAt: '2026-11-14T09:59:59.000Z',
      publishStartedAt: '2026-11-14T09:59:50.000Z',
      dispatchOutcome: 'not_attempted',
      attemptCount: 0,
    });
    const publisher = createMockPublisher();
    const dispatch = createDispatcher(state.repository, publisher, {
      venueId: 'venue-1',
      topic: 'bell/test',
      now: () => state.now,
    });
    const result = await dispatch({
      sessionId: 'session-1',
      generation: 1,
      purpose: 'notification',
      notificationId: state.session.notifications[0]!.id,
    });
    expect(result.outcome).toBe('unknown');
    expect(state.read().notifications[0]?.dispatchOutcome).toBe('ambiguous');
    expect(publisher.messages).toHaveLength(0);
  });

  it('retries ambiguous broker acknowledgement once with the same command id', async () => {
    const state = setup();
    const publisher = createMockPublisher(['ambiguous', 'accepted']);
    const dispatch = createDispatcher(state.repository, publisher, {
      venueId: 'venue-1',
      topic: 'bell/test',
      now: () => state.now,
    });
    const result = await dispatch({
      sessionId: 'session-1',
      generation: 1,
      purpose: 'notification',
      notificationId: state.session.notifications[0]!.id,
    });
    expect(result.outcome).toBe('sent');
    expect(publisher.messages).toHaveLength(2);
    expect(publisher.messages[0]?.command).toEqual(publisher.messages[1]?.command);
    expect(state.read().notifications[0]?.attemptCount).toBe(2);
  });

  it('does not publish while another active lease owns the notification', async () => {
    const state = setup({
      status: 'dispatching',
      claimExpiresAt: '2026-11-14T10:00:10.000Z',
      claimToken: 'active',
    });
    const publisher = createMockPublisher();
    const dispatch = createDispatcher(state.repository, publisher, {
      venueId: 'venue-1',
      topic: 'bell/test',
      now: () => state.now,
    });
    const result = await dispatch({
      sessionId: 'session-1',
      generation: 1,
      purpose: 'notification',
      notificationId: state.session.notifications[0]!.id,
    });
    expect(result.outcome).toBe('lease-active');
    expect(publisher.messages).toHaveLength(0);
  });
});
