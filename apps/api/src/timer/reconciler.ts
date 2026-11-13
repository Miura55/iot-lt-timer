import type { TimerRepository } from './repository.js';
import type { StepFunctionsWakeRegistrar } from './wake-registrar.js';
import type { TimerSession } from '@lt-timer/domain';
import type { DispatchEvent } from './dispatcher.js';
import { recoverControlOperation } from './service.js';
import { operationEvent } from './observability.js';

export function createReconciler(repository: TimerRepository, registrar: StepFunctionsWakeRegistrar, dispatch: (event: DispatchEvent) => Promise<unknown>, options: { now?: () => Date } = {}) {
  return async () => {
    const now = (options.now ?? (() => new Date()))();
    const due = await repository.dueWakeRegistrations(now.toISOString(), 100);
    let repaired = 0;
    for (const target of due) {
      const session = await repository.getSession(target.sessionId);
      if (!session) continue;
      if (session.state !== 'running') continue;
      if (target.notificationId) {
        const notification = session.notifications.find((row) => row.id === target.notificationId);
        if (!notification || !notification.scheduledAt || notification.status !== 'pending' || notification.wake.status === 'registered') continue;
        await registrar.reconcile(session, { targetId: notification.id, generation: notification.generation, purpose: 'notification', notificationId: notification.id, scheduledAt: notification.scheduledAt });
        operationEvent({ event: 'timer-wake-repaired', operation: 'reconcile', result: 'repaired', sessionId: session.id, notificationId: notification.id, version: session.version, generation: session.generation, timestamp: now });
      } else {
        if (!session.deadline || session.deadlineWake.status === 'registered') continue;
        await registrar.reconcile(session, { targetId: session.id, generation: session.generation, purpose: 'deadline', scheduledAt: session.deadline });
        operationEvent({ event: 'timer-wake-repaired', operation: 'reconcile', result: 'repaired', sessionId: session.id, version: session.version, generation: session.generation, timestamp: now });
      }
      repaired += 1;
    }
    const dueRecovery = await repository.dueRecoveryTargets(now.toISOString(), 100);
    for (const target of dueRecovery) {
      const session = await repository.getSession(target.sessionId);
      if (!session) continue;
      if (session.pendingOperation && Date.parse(session.pendingOperation.leaseExpiresAt) <= now.getTime()) {
        const recovery = await recoverControlOperation(repository, registrar, session.id, now);
        operationEvent({ event: 'timer-operation-lease-recovery', operation: 'reconcile', result: recovery.statusCode === 200 ? 'recovered' : 'pending', sessionId: session.id, operationKey: session.pendingOperation.idempotencyKey, version: session.version, generation: session.generation, timestamp: now });
        repaired += 1;
        continue;
      }
      if (session.state !== 'running') continue;
      if (target.notificationId) {
        const notification = session.notifications.find((row) => row.id === target.notificationId);
        if (!notification || !['pending', 'dispatching'].includes(notification.status)) continue;
        await dispatch({ sessionId: session.id, generation: notification.generation, purpose: 'notification', notificationId: notification.id });
      } else {
        await dispatch({ sessionId: session.id, generation: session.generation, purpose: 'deadline' });
      }
      repaired += 1;
    }
    return { checked: due.length + dueRecovery.length, repaired };
  };
}

export function dueTargets(session: TimerSession, now: Date) {
  return [
    ...(session.deadlineWake.status !== 'registered' && session.deadline && Date.parse(session.deadline) <= now.getTime() ? [{ purpose: 'deadline' as const, targetId: session.id }] : []),
    ...session.notifications.filter((notification) => notification.status === 'pending' && notification.scheduledAt && notification.wake.status !== 'registered' && Date.parse(notification.scheduledAt) <= now.getTime()).map((notification) => ({ purpose: 'notification' as const, targetId: notification.id, notificationId: notification.id })),
  ];
}
