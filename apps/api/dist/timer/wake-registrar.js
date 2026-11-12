import { createHash } from 'node:crypto';
import { StartExecutionCommand, ListExecutionsCommand } from '@aws-sdk/client-sfn';
import { deterministicWake } from '@lt-timer/domain';
export class StepFunctionsWakeRegistrar {
    client;
    stateMachineArn;
    repository;
    constructor(client, stateMachineArn, repository) {
        this.client = client;
        this.stateMachineArn = stateMachineArn;
        this.repository = repository;
    }
    async register(session, input) {
        const targetId = input.targetId;
        const notification = input.notificationId ? session.notifications.find((row) => row.id === input.notificationId) : undefined;
        if (input.notificationId && !notification)
            throw new Error('NOTIFICATION_NOT_FOUND');
        const current = notification?.wake ?? session.deadlineWake;
        if (current.status === 'registered')
            return;
        const payload = { schemaVersion: 1, sessionId: session.id, generation: input.generation, purpose: input.purpose, notificationId: input.notificationId, scheduledAt: input.scheduledAt };
        const execution = deterministicWake(targetId, input.generation, input.purpose, current.attempt, payload);
        const wake = { ...current, executionName: execution.executionName, inputHash: execution.inputHash, status: 'pending' };
        await this.repository.setWakeState(session.id, input.notificationId, wake, current.status);
        try {
            await this.client.send(new StartExecutionCommand({ stateMachineArn: this.stateMachineArn, name: execution.executionName, input: execution.input }));
            await this.repository.setWakeState(session.id, input.notificationId, { ...wake, status: 'registered', registeredAt: new Date().toISOString(), lastError: undefined }, 'pending');
        }
        catch (error) {
            const name = error.name ?? '';
            if (name === 'ExecutionAlreadyExists') {
                await this.resolveExisting(session, input, wake, execution.executionName, execution.inputHash);
                return;
            }
            if (isAmbiguous(error)) {
                try {
                    await this.client.send(new StartExecutionCommand({ stateMachineArn: this.stateMachineArn, name: execution.executionName, input: execution.input }));
                    await this.repository.setWakeState(session.id, input.notificationId, { ...wake, status: 'registered', registeredAt: new Date().toISOString() }, 'pending');
                    return;
                }
                catch (retryError) {
                    if (retryError.name === 'ExecutionAlreadyExists') {
                        await this.resolveExisting(session, input, wake, execution.executionName, execution.inputHash);
                        return;
                    }
                    if (isAmbiguous(retryError))
                        return; // Keep the same durable attempt; reconciliation will look up this exact name/input.
                    error = retryError;
                }
            }
            await this.repository.setWakeState(session.id, input.notificationId, { ...wake, status: 'failed', lastError: name }, 'pending');
            throw error;
        }
    }
    async reconcile(session, input) {
        const targetId = input.targetId;
        const notification = input.notificationId ? session.notifications.find((row) => row.id === input.notificationId) : undefined;
        const wake = notification?.wake ?? session.deadlineWake;
        if (wake.status === 'registered')
            return;
        const payload = { schemaVersion: 1, sessionId: session.id, generation: input.generation, purpose: input.purpose, notificationId: input.notificationId, scheduledAt: input.scheduledAt };
        const execution = deterministicWake(targetId, input.generation, input.purpose, wake.attempt, payload);
        try {
            await this.client.send(new StartExecutionCommand({ stateMachineArn: this.stateMachineArn, name: execution.executionName, input: execution.input }));
            await this.repository.setWakeState(session.id, input.notificationId, { ...wake, executionName: execution.executionName, inputHash: execution.inputHash, status: 'registered', registeredAt: new Date().toISOString() }, wake.status);
        }
        catch (error) {
            if (error.name === 'ExecutionAlreadyExists') {
                await this.resolveExisting(session, input, wake, execution.executionName, execution.inputHash);
                return;
            }
            if (isAmbiguous(error))
                return;
            const nextWake = { ...wake, attempt: wake.attempt + 1, status: 'pending', executionName: undefined, inputHash: undefined, lastError: error.name ?? 'TerminalStartFailure' };
            await this.repository.setWakeState(session.id, input.notificationId, nextWake, wake.status);
        }
    }
    async resolveExisting(session, input, wake, executionName, inputHash) {
        const listing = await this.client.send(new ListExecutionsCommand({ stateMachineArn: this.stateMachineArn, maxResults: 100 }));
        const found = listing.executions?.find((row) => row.name === executionName);
        if (!found)
            return; // Keep the same durable attempt while the execution state is unknown.
        const status = found.status ?? '';
        if (status === 'RUNNING' || status === 'SUCCEEDED') {
            await this.repository.setWakeState(session.id, input.notificationId, { ...wake, executionName, inputHash, status: 'registered', registeredAt: new Date().toISOString(), lastError: undefined }, wake.status);
            return;
        }
        if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
            const nextWake = { ...wake, attempt: wake.attempt + 1, status: 'pending', executionName: undefined, inputHash: undefined, lastError: status };
            await this.repository.setWakeState(session.id, input.notificationId, nextWake, wake.status);
        }
    }
}
function isAmbiguous(error) {
    const name = error.name ?? '';
    const status = error.$metadata?.httpStatusCode;
    return status === undefined || status >= 500 || ['TimeoutError', 'AbortError', 'NetworkingError', 'ECONNRESET'].includes(name);
}
export function payloadHash(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
//# sourceMappingURL=wake-registrar.js.map