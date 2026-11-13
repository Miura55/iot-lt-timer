export type ControlAction = 'pause' | 'resume' | 'cancel';
export interface PendingControlAttempt {
  sessionId: string;
  action: ControlAction;
  expectedVersion: number;
  idempotencyKey: string;
}
export interface ControlAttemptStore {
  current: PendingControlAttempt | null;
}

export async function submitControlRequest(args: {
  apiUrl: string;
  sessionId: string;
  action: ControlAction;
  expectedVersion: number;
  token: string | undefined;
  pendingAttempt: ControlAttemptStore;
  refreshState: () => Promise<void>;
  send?: typeof fetch;
  newKey?: () => string;
}) {
  const existing = args.pendingAttempt.current;
  const attempt =
    existing?.sessionId === args.sessionId && existing.action === args.action
      ? existing
      : {
          sessionId: args.sessionId,
          action: args.action,
          expectedVersion: args.expectedVersion,
          idempotencyKey: args.newKey ? args.newKey() : crypto.randomUUID(),
        };
  args.pendingAttempt.current = attempt;
  let response: Response;
  try {
    response = await (args.send ?? fetch)(
      `${args.apiUrl}/v1/sessions/${encodeURIComponent(attempt.sessionId)}/${attempt.action}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${args.token}`,
          'idempotency-key': attempt.idempotencyKey,
        },
        body: JSON.stringify({ expectedVersion: attempt.expectedVersion }),
      },
    );
  } catch {
    throw new Error('通信に失敗しました。同じ操作を再試行してください。');
  }

  if (!response.ok) {
    let code = 'UNAVAILABLE';
    try {
      code = ((await response.json()) as { code?: string }).code ?? code;
    } catch {
      /* Keep the generic failure code. */
    }
    if (code === 'IN_PROGRESS') {
      await args.refreshState();
      return { status: 'in-progress' as const };
    }
    if (response.status < 500) args.pendingAttempt.current = null;
    if (code === 'VERSION_CONFLICT') await args.refreshState();
    throw new Error(
      code === 'VERSION_CONFLICT'
        ? '状態が更新されました。最新の状態を確認してください。'
        : '操作を完了できませんでした。',
    );
  }

  args.pendingAttempt.current = null;
  await args.refreshState();
  return { status: 'completed' as const };
}
