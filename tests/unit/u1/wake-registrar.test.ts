import { describe, expect, it } from 'vitest';
import { buildSession } from '../../../apps/api/src/timer/service.js';
import { StepFunctionsWakeRegistrar } from '../../../apps/api/src/timer/wake-registrar.js';
import type { TimerRepository } from '../../../apps/api/src/timer/repository.js';

const now = new Date('2026-11-14T10:00:00.000Z');
const session = buildSession({
  id: 'session-wake',
  venueId: 'venue-1',
  principalId: 'operator',
  key: 'key-wake',
  input: { settings: { durationSeconds: 60, bells: [] } },
  now,
});
const input = {
  targetId: session.id,
  generation: 1,
  purpose: 'deadline' as const,
  scheduledAt: session.deadline!,
};

function setup(existingStatus?: string) {
  const writes: Array<{
    wake: { status: string; attempt: number; executionName?: string; inputHash?: string };
    previous: string;
  }> = [];
  const repository = {
    async setWakeState(
      _sessionId: string,
      _notificationId: string | undefined,
      wake: never,
      previous: string,
    ) {
      writes.push({ wake, previous });
      return true;
    },
  } as unknown as TimerRepository;
  const client = {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === 'StartExecutionCommand') {
        const error = new Error('duplicate');
        error.name = 'ExecutionAlreadyExists';
        throw error;
      }
      return {
        executions: existingStatus
          ? [{ name: writes[0]?.wake.executionName, status: existingStatus }]
          : [],
      };
    },
  };
  return {
    writes,
    registrar: new StepFunctionsWakeRegistrar(client as never, 'arn:test', repository),
  };
}

describe('U1 Step Functions wake registration recovery', () => {
  it.each(['RUNNING', 'SUCCEEDED'])(
    'treats an existing %s execution as registered',
    async (status) => {
      const { writes, registrar } = setup(status);
      await registrar.register(session, input);
      expect(writes.at(-1)?.wake.status).toBe('registered');
      expect(writes.at(-1)?.wake.executionName).toBe(writes[0]?.wake.executionName);
      expect(writes.at(-1)?.wake.inputHash).toBeTruthy();
    },
  );

  it.each(['FAILED', 'TIMED_OUT', 'ABORTED'])(
    'advances attempt after terminal %s execution',
    async (status) => {
      const { writes, registrar } = setup(status);
      await registrar.register(session, input);
      expect(writes.at(-1)?.wake).toMatchObject({
        status: 'pending',
        attempt: 2,
        lastError: status,
      });
      expect(writes.at(-1)?.wake.executionName).toBeUndefined();
    },
  );

  it('keeps the same attempt and identity when execution lookup has no result', async () => {
    const { writes, registrar } = setup();
    await registrar.register(session, input);
    expect(writes.at(-1)?.wake).toMatchObject({ status: 'pending', attempt: 1 });
    expect(writes.at(-1)?.wake.executionName).toBe(writes[0]?.wake.executionName);
    expect(writes.at(-1)?.wake.inputHash).toBe(writes[0]?.wake.inputHash);
  });
});
