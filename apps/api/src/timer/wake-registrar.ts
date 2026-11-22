import { createHash } from 'node:crypto';
import { StartExecutionCommand, ListExecutionsCommand, SFNClient } from '@aws-sdk/client-sfn';
import { deterministicWake, type TimerSession } from '@lt-timer/domain';
import type { TimerRepository } from './repository.js';

export interface WakeStartInput {
  targetId: string;
  generation: number;
  purpose: 'deadline' | 'notification';
  scheduledAt: string;
  notificationId?: string;
}

export class StepFunctionsWakeRegistrar {
  constructor(
    private readonly client: SFNClient,
    private readonly stateMachineArn: string,
    private readonly repository: TimerRepository,
  ) {}

  async register(session: TimerSession, input: WakeStartInput): Promise<void> {
    const targetId = input.targetId;
    const notification = input.notificationId
      ? session.notifications.find((row) => row.id === input.notificationId)
      : undefined;
    if (input.notificationId && !notification) throw new Error('NOTIFICATION_NOT_FOUND');
    const current = notification?.wake ?? session.deadlineWake;
    if (current.status === 'registered') return;
    const payload = {
      schemaVersion: 1,
      sessionId: session.id,
      generation: input.generation,
      purpose: input.purpose,
      notificationId: input.notificationId,
      scheduledAt: input.scheduledAt,
    };
    const execution = deterministicWake(
      targetId,
      input.generation,
      input.purpose,
      current.attempt,
      payload,
    );
    const wake = {
      ...current,
      executionName: execution.executionName,
      inputHash: execution.inputHash,
      status: 'pending' as const,
    };
    await this.repository.setWakeState(
      session.id,
      input.notificationId,
      wake,
      current.status,
      input.generation,
    );
    try {
      await this.client.send(
        new StartExecutionCommand({
          stateMachineArn: this.stateMachineArn,
          name: execution.executionName,
          input: execution.input,
        }),
      );
      console.info(
        JSON.stringify({
          event: 'timer-wake-execution-started',
          sessionId: session.id,
          targetId,
          generation: input.generation,
          purpose: input.purpose,
          executionName: execution.executionName,
          scheduledAt: input.scheduledAt,
        }),
      );
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        {
          ...wake,
          status: 'registered',
          registeredAt: new Date().toISOString(),
          lastError: undefined,
        },
        'pending',
        input.generation,
      );
    } catch (error) {
      const name = (error as { name?: string }).name ?? '';
      console.error(
        JSON.stringify({
          event: 'timer-wake-execution-start-error',
          sessionId: session.id,
          targetId,
          generation: input.generation,
          purpose: input.purpose,
          executionName: execution.executionName,
          errorName: name || 'UnknownError',
          httpStatusCode: (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode,
          requestId: (error as { $metadata?: { requestId?: string } }).$metadata?.requestId,
        }),
      );
      if (name === 'ExecutionAlreadyExists') {
        await this.resolveExisting(
          session,
          input,
          wake,
          execution.executionName,
          execution.inputHash,
        );
        return;
      }
      if (isAmbiguous(error)) {
        try {
          await this.client.send(
            new StartExecutionCommand({
              stateMachineArn: this.stateMachineArn,
              name: execution.executionName,
              input: execution.input,
            }),
          );
          await this.repository.setWakeState(
            session.id,
            input.notificationId,
            { ...wake, status: 'registered', registeredAt: new Date().toISOString() },
            'pending',
            input.generation,
          );
          return;
        } catch (retryError) {
          if ((retryError as { name?: string }).name === 'ExecutionAlreadyExists') {
            await this.resolveExisting(
              session,
              input,
              wake,
              execution.executionName,
              execution.inputHash,
            );
            return;
          }
          if (isAmbiguous(retryError)) return; // Keep the same durable attempt; reconciliation will look up this exact name/input.
          error = retryError;
        }
      }
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        { ...wake, status: 'failed', lastError: name },
        'pending',
        input.generation,
      );
      throw error;
    }
  }

  async reconcile(session: TimerSession, input: WakeStartInput) {
    const targetId = input.targetId;
    const notification = input.notificationId
      ? session.notifications.find((row) => row.id === input.notificationId)
      : undefined;
    const wake = notification?.wake ?? session.deadlineWake;
    if (wake.status === 'registered') return;
    const payload = {
      schemaVersion: 1,
      sessionId: session.id,
      generation: input.generation,
      purpose: input.purpose,
      notificationId: input.notificationId,
      scheduledAt: input.scheduledAt,
    };
    const execution = deterministicWake(
      targetId,
      input.generation,
      input.purpose,
      wake.attempt,
      payload,
    );
    try {
      await this.client.send(
        new StartExecutionCommand({
          stateMachineArn: this.stateMachineArn,
          name: execution.executionName,
          input: execution.input,
        }),
      );
      console.info(
        JSON.stringify({
          event: 'timer-wake-execution-started',
          sessionId: session.id,
          targetId,
          generation: input.generation,
          purpose: input.purpose,
          executionName: execution.executionName,
          scheduledAt: input.scheduledAt,
          source: 'reconcile',
        }),
      );
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        {
          ...wake,
          executionName: execution.executionName,
          inputHash: execution.inputHash,
          status: 'registered',
          registeredAt: new Date().toISOString(),
        },
        wake.status,
        input.generation,
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'ExecutionAlreadyExists') {
        await this.resolveExisting(
          session,
          input,
          wake,
          execution.executionName,
          execution.inputHash,
        );
        return;
      }
      if (isAmbiguous(error)) return;
      const nextWake = {
        ...wake,
        attempt: wake.attempt + 1,
        status: 'pending' as const,
        executionName: undefined,
        inputHash: undefined,
        lastError: (error as { name?: string }).name ?? 'TerminalStartFailure',
      };
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        nextWake,
        wake.status,
        input.generation,
      );
    }
  }

  private async resolveExisting(
    session: TimerSession,
    input: WakeStartInput,
    wake: TimerSession['deadlineWake'],
    executionName: string,
    inputHash?: string,
  ) {
    const listing = await this.client.send(
      new ListExecutionsCommand({ stateMachineArn: this.stateMachineArn, maxResults: 100 }),
    );
    const found = listing.executions?.find((row) => row.name === executionName);
    if (!found) return; // Keep the same durable attempt while the execution state is unknown.
    const status = found.status ?? '';
    if (status === 'RUNNING' || status === 'SUCCEEDED') {
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        {
          ...wake,
          executionName,
          inputHash,
          status: 'registered',
          registeredAt: new Date().toISOString(),
          lastError: undefined,
        },
        wake.status,
        input.generation,
      );
      return;
    }
    if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
      const nextWake = {
        ...wake,
        attempt: wake.attempt + 1,
        status: 'pending' as const,
        executionName: undefined,
        inputHash: undefined,
        lastError: status,
      };
      await this.repository.setWakeState(
        session.id,
        input.notificationId,
        nextWake,
        wake.status,
        input.generation,
      );
    }
  }
}

function isAmbiguous(error: unknown) {
  const name = (error as { name?: string }).name ?? '';
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return (
    status === undefined ||
    status >= 500 ||
    ['TimeoutError', 'AbortError', 'NetworkingError', 'ECONNRESET'].includes(name)
  );
}

export function payloadHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
