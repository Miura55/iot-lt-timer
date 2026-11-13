import type { ControlRoute, Notification, TimerSession } from './types.js';

export class ControlTransitionError extends Error {
  constructor(readonly code: 'INVALID_STATE' | 'VERSION_CONFLICT' | 'IN_PROGRESS') {
    super(code);
  }
}

export function controlRouteName(route: ControlRoute): 'pause' | 'resume' | 'cancel' {
  return route.endsWith('/pause') ? 'pause' : route.endsWith('/resume') ? 'resume' : 'cancel';
}

export function applyControlTransition(session: TimerSession, route: ControlRoute, now: Date): TimerSession {
  const action = controlRouteName(route);
  const hasActiveDispatch = session.notifications.some((notification) => notification.status === 'dispatching');
  if (hasActiveDispatch && (action === 'pause' || action === 'cancel')) throw new ControlTransitionError('IN_PROGRESS');

  if (action === 'pause') {
    if (session.state !== 'running' || !session.deadline) throw new ControlTransitionError('INVALID_STATE');
    return {
      ...session,
      state: 'paused',
      remainingSeconds: Math.max(0, Math.ceil((Date.parse(session.deadline) - now.getTime()) / 1_000)),
      deadline: null,
      version: session.version + 1,
      updatedAt: now.toISOString(),
      notifications: session.notifications.map((notification) => pauseNotification(notification)),
    };
  }

  if (action === 'resume') {
    if (session.state !== 'paused') throw new ControlTransitionError('INVALID_STATE');
    const deadline = new Date(now.getTime() + session.remainingSeconds * 1_000);
    const generation = session.generation + 1;
    return {
      ...session,
      state: 'running',
      deadline: deadline.toISOString(),
      generation,
      version: session.version + 1,
      updatedAt: now.toISOString(),
      notifications: session.notifications.map((notification) => resumeNotification(notification, deadline, generation)),
      deadlineWake: { status: 'pending', attempt: 1 },
    };
  }

  if (session.state !== 'running' && session.state !== 'paused') throw new ControlTransitionError('INVALID_STATE');
  return {
    ...session,
    state: 'cancelled',
    deadline: null,
    version: session.version + 1,
    updatedAt: now.toISOString(),
    notifications: session.notifications.map((notification) => cancelNotification(notification)),
  };
}

function pauseNotification(notification: Notification): Notification {
  if (notification.status !== 'pending') return notification;
  return { ...notification, scheduledAt: null, expiresAt: null, wake: { status: 'pending', attempt: notification.wake.attempt + 1 } };
}

function resumeNotification(notification: Notification, deadline: Date, generation: number): Notification {
  if (notification.status !== 'pending') return notification;
  const scheduledAt = new Date(deadline.getTime() - notification.remainingSeconds * 1_000);
  return {
    ...notification,
    scheduledAt: scheduledAt.toISOString(),
    expiresAt: new Date(scheduledAt.getTime() + 5_000).toISOString(),
    generation,
    wake: { status: 'pending', attempt: 1 },
  };
}

function cancelNotification(notification: Notification): Notification {
  if (notification.status !== 'pending') return notification;
  return { ...notification, status: 'cancelled', scheduledAt: null, expiresAt: null };
}
