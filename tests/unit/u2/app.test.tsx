// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmSignIn, fetchAuthSession, signIn, signOut } from '@aws-amplify/auth';
import { App } from '../../../apps/web/src/timer-app.js';

vi.mock('@aws-amplify/auth', () => ({
  confirmSignIn: vi.fn(),
  fetchAuthSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyState = { serverTime: '2026-11-14T10:00:00.000Z', session: null };
const activeState = {
  serverTime: '2026-11-14T10:00:00.000Z',
  session: {
    id: 'session-1',
    version: 4,
    state: 'running',
    remainingSeconds: 65,
    notifications: [
      { id: 'bell-1', remainingSeconds: 60, ringCount: 2, status: 'sent' },
      { id: 'bell-2', remainingSeconds: 0, ringCount: 3, status: 'unknown' },
    ],
  },
};

describe('LT timer app', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: { idToken: { toString: () => 'test-jwt' } },
    } as never);
    vi.mocked(signOut).mockResolvedValue(undefined);
  });

  it('shows an error after a rejected sign-in', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('bad credentials'));
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('login-email-input'), 'speaker@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'wrong-password');
    await user.click(screen.getByTestId('login-submit-button'));
    expect((await screen.findByRole('alert')).textContent).toContain('ログインできません');
  });

  it('sets a first-login password and shows the timer form after sign-in', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    } as never);
    vi.mocked(confirmSignIn).mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(emptyState)));
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('login-email-input'), 'speaker@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'temporary-password');
    await user.click(screen.getByTestId('login-submit-button'));
    expect(await screen.findByText('初回ログインのため新しいパスワードを設定')).toBeTruthy();
    await user.clear(screen.getByTestId('login-password-input'));
    await user.type(screen.getByTestId('login-password-input'), 'new-secure-password');
    await user.click(screen.getByTestId('login-submit-button'));
    expect(await screen.findByText('タイマーを設定')).toBeTruthy();
    expect(confirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'new-secure-password' });
  });

  it('adds, edits, removes a bell and starts a timer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyState))
      .mockResolvedValueOnce(response({ sessionId: 'session-1' }))
      .mockResolvedValueOnce(response(activeState));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(signIn).mockResolvedValueOnce({ nextStep: { signInStep: 'DONE' } } as never);
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('login-email-input'), 'speaker@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'secure-password');
    await user.click(screen.getByTestId('login-submit-button'));
    await screen.findByText('タイマーを設定');
    await user.click(screen.getByTestId('bell-add-button'));
    await user.clear(screen.getByTestId('bell-time-0'));
    await user.type(screen.getByTestId('bell-time-0'), '60');
    await user.selectOptions(screen.getByTestId('bell-count-0'), '2');
    await user.click(screen.getByTestId('bell-remove-0'));
    await user.click(screen.getByTestId('bell-add-button'));
    await user.clear(screen.getByTestId('duration-input'));
    await user.type(screen.getByTestId('duration-input'), '300');
    await user.click(screen.getByTestId('timer-start-button'));
    expect((await screen.findByTestId('remaining-time')).textContent).toContain('01:05');
    const startRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(startRequest.method).toBe('POST');
    expect(JSON.parse(String(startRequest.body))).toMatchObject({
      settings: { durationSeconds: 300, bells: [{ remainingSeconds: 0, ringCount: 1 }] },
    });
  });

  it('shows the active session, notification states, handles pause, and signs out', async () => {
    const pausedState = {
      ...activeState,
      session: { ...activeState.session, state: 'paused', remainingSeconds: 65 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(activeState))
      .mockResolvedValueOnce(response({ state: pausedState.session }))
      .mockResolvedValueOnce(response(pausedState));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(signIn).mockResolvedValueOnce({ nextStep: { signInStep: 'DONE' } } as never);
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('login-email-input'), 'speaker@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'secure-password');
    await user.click(screen.getByTestId('login-submit-button'));
    expect(await screen.findByText('送信受付済み')).toBeTruthy();
    expect(screen.getByText('結果不明')).toBeTruthy();
    await user.click(screen.getByTestId('timer-pause-button'));
    await waitFor(() => expect(screen.getByText('一時停止中')).toBeTruthy());
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/pause');
    await user.click(screen.getByTestId('logout-button'));
    expect(await screen.findByText('主催者アカウントでログイン')).toBeTruthy();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('explains an already active timer and refreshes state errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyState))
      .mockResolvedValueOnce(response({ code: 'ACTIVE_SESSION' }, 409));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(signIn).mockResolvedValueOnce({ nextStep: { signInStep: 'DONE' } } as never);
    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('login-email-input'), 'speaker@example.com');
    await user.type(screen.getByTestId('login-password-input'), 'secure-password');
    await user.click(screen.getByTestId('login-submit-button'));
    await screen.findByText('タイマーを設定');
    await user.click(screen.getByTestId('timer-start-button'));
    expect((await screen.findByRole('alert')).textContent).toContain('タイマーはすでに実行中です');
    await user.click(screen.getByTestId('bell-add-button'));
    expect(screen.getByTestId('bell-remove-0')).toBeTruthy();
  });
});
