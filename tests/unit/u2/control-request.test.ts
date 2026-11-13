import { describe, expect, it, vi } from 'vitest';
import { submitControlRequest, type ControlAttemptStore } from '../../../apps/web/src/control-request.js';

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } } as Response;
}

describe('U2 UI control request idempotency', () => {
  it('reuses the same key and original version after a network timeout', async () => {
    const pending: ControlAttemptStore = { current: null };
    const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(response(200));
    const base = { apiUrl: 'https://api', sessionId: 's-1', action: 'pause' as const, expectedVersion: 4, token: 'jwt', pendingAttempt: pending, refreshState: vi.fn().mockResolvedValue(undefined), send, newKey: vi.fn(() => 'same-key') };
    await expect(submitControlRequest(base)).rejects.toThrow('通信に失敗しました');
    await submitControlRequest({ ...base, expectedVersion: 5 });
    expect(send.mock.calls[0]?.[1]?.headers).toMatchObject({ 'idempotency-key': 'same-key' });
    expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({ 'idempotency-key': 'same-key' });
    expect(send.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ expectedVersion: 4 }));
    expect(pending.current).toBeNull();
  });
  it('refreshes server state on IN_PROGRESS and retains the key for a follow-up retry', async () => {
    const pending: ControlAttemptStore = { current: null };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValueOnce(response(409, { code: 'IN_PROGRESS' })).mockResolvedValueOnce(response(200));
    const base = { apiUrl: '', sessionId: 's-1', action: 'cancel' as const, expectedVersion: 8, token: 'jwt', pendingAttempt: pending, refreshState: refresh, send, newKey: () => 'operation-key' };
    await expect(submitControlRequest(base)).resolves.toEqual({ status: 'in-progress' });
    expect(refresh).toHaveBeenCalledTimes(1);
    await submitControlRequest(base);
    expect(send.mock.calls.map((call) => call[1]?.headers?.['idempotency-key'])).toEqual(['operation-key', 'operation-key']);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('keeps the operation key after a server 503 for another attempt', async () => {
    const pending: ControlAttemptStore = { current: null };
    const send = vi.fn().mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));
    const base = { apiUrl: '', sessionId: 's-1', action: 'resume' as const, expectedVersion: 2, token: 'jwt', pendingAttempt: pending, refreshState: vi.fn().mockResolvedValue(undefined), send, newKey: () => 'retry-key' };
    await expect(submitControlRequest(base)).rejects.toThrow('操作を完了できません');
    await submitControlRequest(base);
    expect(send.mock.calls[0]?.[1]?.headers).toMatchObject({ 'idempotency-key': 'retry-key' });
    expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({ 'idempotency-key': 'retry-key' });
  });
  it('clears a definitive version conflict and refreshes the state', async () => {
    const pending: ControlAttemptStore = { current: null };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(response(409, { code: 'VERSION_CONFLICT' }));
    await expect(submitControlRequest({ apiUrl: '', sessionId: 's-1', action: 'pause', expectedVersion: 2, token: 'jwt', pendingAttempt: pending, refreshState: refresh, send, newKey: () => 'conflict-key' })).rejects.toThrow('状態が更新されました');
    expect(pending.current).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('starts a different attempt after a completed control operation', async () => {
    const pending: ControlAttemptStore = { current: null };
    const send = vi.fn().mockResolvedValue(response(200));
    const newKey = vi.fn().mockReturnValueOnce('key-one').mockReturnValueOnce('key-two');
    const base = { apiUrl: '', sessionId: 's-1', action: 'pause' as const, expectedVersion: 1, token: 'jwt', pendingAttempt: pending, refreshState: vi.fn().mockResolvedValue(undefined), send, newKey };
    await submitControlRequest(base);
    await submitControlRequest({ ...base, action: 'resume', expectedVersion: 2 });
    expect(send.mock.calls.map((call) => call[1]?.headers?.['idempotency-key'])).toEqual(['key-one', 'key-two']);
  });
});
