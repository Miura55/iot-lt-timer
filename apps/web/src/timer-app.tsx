import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { confirmSignIn, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';
import {
  submitControlRequest,
  type ControlAction,
  type ControlAttemptStore,
} from './control-request.js';

type Bell = { remainingSeconds: number; ringCount: 1 | 2 | 3 };
type Notification = { id: string; remainingSeconds: number; ringCount: number; status: string };
type SessionState = {
  id: string;
  version: number;
  state: string;
  remainingSeconds: number;
  notifications: Notification[];
} | null;
type StateResponse = { serverTime: string; session: SessionState };

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPasswordRequired, setNewPasswordRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [duration, setDuration] = useState('600');
  const [bells, setBells] = useState<Bell[]>([]);
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const pendingControlAttempt = useRef<ControlAttemptStore['current']>(null);

  const token = useCallback(async () => (await fetchAuthSession()).tokens?.idToken?.toString(), []);

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (active && session.tokens?.idToken) setAuthenticated(true);
      })
      .catch(() => {
        // No saved session is a normal state; show the login form instead.
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadState = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const sequence = ++requestSequence.current;
    try {
      const jwt = await token();
      const response = await fetch(`${API_URL}/v1/state`, {
        headers: { authorization: `Bearer ${jwt}` },
        cache: 'no-store',
      });
      if (response.status === 403)
        throw new Error('状態を取得する権限がありません。会場のread権限を確認してください。');
      if (!response.ok)
        throw new Error('状態を取得できませんでした。ネットワークとログインを確認してください。');
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('状態APIからJSON以外の応答が返りました。CloudFrontとAPIの設定を確認してください。');
      const result = (await response.json()) as StateResponse;
      if (sequence !== requestSequence.current) return;
      setState(result);
      setLastUpdated(new Date());
      setError('');
    } catch (cause) {
      if (sequence === requestSequence.current)
        setError(
          cause instanceof Error
            ? cause.message
            : '状態を更新できません。最後に取得した情報を表示しています。',
        );
    }
  }, [token]);

  useEffect(() => {
    if (!authenticated) return;
    void loadState();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadState();
    }, 2_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadState();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authenticated, loadState]);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn({ username: email, password });
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED')
        setNewPasswordRequired(true);
      else setAuthenticated(true);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'UserAlreadyAuthenticatedException') {
        try {
          const session = await fetchAuthSession();
          if (session.tokens?.idToken) {
            setAuthenticated(true);
            return;
          }
        } catch {
          // Fall through to the normal login error if the saved session is unusable.
        }
      }
      // Keep credentials and Cognito challenge parameters out of logs; the
      // error name and message are enough to diagnose a failed SRP exchange.
      console.error('Cognito sign-in failed', {
        name: cause instanceof Error ? cause.name : 'UnknownError',
        message: cause instanceof Error ? cause.message : 'Unknown sign-in error',
      });
      setError('ログインできません。メールアドレスとパスワードを確認してください。');
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await confirmSignIn({ challengeResponse: password });
      setNewPasswordRequired(false);
      setAuthenticated(true);
    } catch {
      setError('新しいパスワードを設定できません。12文字以上で入力してください。');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuthenticated(false);
    setState(null);
  }

  async function handleControl(action: ControlAction) {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const outcome = await submitControlRequest({
        apiUrl: API_URL,
        sessionId: session.id,
        action,
        expectedVersion: session.version,
        token: await token(),
        pendingAttempt: pendingControlAttempt,
        refreshState: loadState,
      });
      if (outcome.status === 'in-progress')
        setError('操作を確認中です。しばらくしてから同じ操作を再試行してください。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作を完了できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const jwt = await token();
      const response = await fetch(`${API_URL}/v1/sessions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${jwt}`,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ settings: { durationSeconds: Number(duration), bells } }),
      });
      if (!response.ok) {
        const detail = (await response.json()) as { code?: string };
        throw new Error(
          detail.code === 'ACTIVE_SESSION'
            ? 'タイマーはすでに実行中です。'
            : '入力内容を確認して、もう一度お試しください。',
        );
      }
      await loadState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'タイマーを開始できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  if (!authReady)
    return (
      <main className="shell">
        <section className="card login">
          <h1>LTベルタイマー</h1>
          <p className="muted">ログイン状態を確認しています…</p>
        </section>
      </main>
    );

  if (!authenticated)
    return (
      <main className="shell">
        <section className="card login">
          <p className="eyebrow">EVENT TIMER</p>
          <h1>LTベルタイマー</h1>
          <p className="muted">
            {newPasswordRequired
              ? '初回ログインのため新しいパスワードを設定'
              : '主催者アカウントでログイン'}
          </p>
          <form onSubmit={newPasswordRequired ? handleNewPassword : handleSignIn} className="stack">
            {!newPasswordRequired && (
              <label>
                メールアドレス
                <input
                  data-testid="login-email-input"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            <label>
              {newPasswordRequired ? '新しいパスワード' : 'パスワード'}
              <input
                data-testid="login-password-input"
                type="password"
                autoComplete={newPasswordRequired ? 'new-password' : 'current-password'}
                minLength={newPasswordRequired ? 12 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button data-testid="login-submit-button" className="primary" disabled={loading}>
              {loading ? '確認中…' : 'ログイン'}
            </button>
          </form>
        </section>
      </main>
    );

  const session = state?.session;
  const canStart = !session || ['completed', 'cancelled'].includes(session.state);
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">EVENT TIMER</p>
          <h1>LTベルタイマー</h1>
        </div>
        <button
          data-testid="logout-button"
          className="text-button"
          onClick={() => void handleSignOut()}
        >
          ログアウト
        </button>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {session && !canStart ? (
        <section className="card live" aria-live="polite">
          <div className="live-head">
            <span className="pill">
              {session.state === 'running'
                ? '実行中'
                : session.state === 'paused'
                  ? '一時停止中'
                  : session.state}
            </span>
            <span className="muted">サーバー時刻で管理</span>
          </div>
          <p className="timer" data-testid="remaining-time">
            {formatRemaining(session.remainingSeconds)}
          </p>
          <p className="muted">残り時間</p>
          {session.remainingSeconds === 0 && <p className="notice">終了ベルの処理を確認中です</p>}
          <TimerControls
            state={session}
            loading={loading}
            onAction={(action) => void handleControl(action)}
          />
          <h2>ベル予定</h2>
          <NotificationList notifications={session.notifications} />
        </section>
      ) : (
        <section className="card">
          <p className="eyebrow">NEW TALK</p>
          <h2>タイマーを設定</h2>
          <form onSubmit={(event) => void handleStart(event)} className="stack">
            <label>
              発表時間（秒）
              <input
                data-testid="duration-input"
                type="number"
                min="1"
                max="10800"
                step="1"
                required
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
            <div className="section-heading">
              <h3>ベルのタイミング</h3>
              <button
                type="button"
                data-testid="bell-add-button"
                className="text-button"
                onClick={() => setBells([...bells, { remainingSeconds: 0, ringCount: 1 }])}
                disabled={bells.length >= 10}
              >
                ＋ 追加
              </button>
            </div>
            {bells.length === 0 && (
              <p className="muted">ベルを鳴らさずにタイマーだけ使うこともできます。</p>
            )}
            {bells.map((bell, index) => (
              <div className="bell-row" key={index}>
                <label>
                  残り秒
                  <input
                    data-testid={`bell-time-${index}`}
                    type="number"
                    min="0"
                    max={duration || 10800}
                    step="1"
                    value={bell.remainingSeconds}
                    onChange={(event) =>
                      updateBell(index, 'remainingSeconds', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  回数
                  <select
                    data-testid={`bell-count-${index}`}
                    value={bell.ringCount}
                    onChange={(event) => updateBell(index, 'ringCount', Number(event.target.value))}
                  >
                    <option value="1">1回</option>
                    <option value="2">2回</option>
                    <option value="3">3回</option>
                  </select>
                </label>
                <button
                  type="button"
                  data-testid={`bell-remove-${index}`}
                  aria-label={`ベル予定${index + 1}を削除`}
                  className="remove"
                  onClick={() => setBells(bells.filter((_, i) => i !== index))}
                >
                  削除
                </button>
              </div>
            ))}
            <p className="hint">
              予定時刻は2秒以上離してください。各ベルは0.5秒間隔で鳴る設定です。
            </p>
            <button
              data-testid="timer-start-button"
              className="primary"
              disabled={loading || !state}
            >
              {loading ? '開始しています…' : 'タイマー開始'}
            </button>
          </form>
        </section>
      )}
      <footer>
        最終更新: {lastUpdated ? lastUpdated.toLocaleTimeString('ja-JP') : '未取得'} ·
        ベルの送信受付は実際の鳴動を保証しません。
      </footer>
    </main>
  );

  function updateBell(index: number, key: keyof Bell, value: number) {
    setBells((current) =>
      current.map((bell, i) => (i === index ? { ...bell, [key]: value } : bell)),
    );
  }
}

export function TimerControls({
  state,
  loading,
  onAction,
}: {
  state: NonNullable<SessionState>;
  loading: boolean;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  return (
    <div className="controls" aria-label="タイマー操作">
      {state.state === 'running' && (
        <button
          data-testid="timer-pause-button"
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => onAction('pause')}
        >
          一時停止
        </button>
      )}
      {state.state === 'paused' && (
        <button
          data-testid="timer-resume-button"
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => onAction('resume')}
        >
          再開
        </button>
      )}
      {['running', 'paused'].includes(state.state) && (
        <button
          data-testid="timer-cancel-button"
          type="button"
          className="danger"
          disabled={loading}
          onClick={() => onAction('cancel')}
        >
          キャンセル
        </button>
      )}
    </div>
  );
}

function NotificationList({ notifications }: { notifications: Notification[] }) {
  if (!notifications.length) return <p className="muted">ベル予定はありません。</p>;
  return (
    <ul className="notifications">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <span>
            残り {formatRemaining(notification.remainingSeconds)} · {notification.ringCount}回
          </span>
          <span className={`status status-${notification.status}`}>
            {statusLabel(notification.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatRemaining(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '予定',
    sent: '送信受付済み',
    failed: '送信失敗',
    expired: '期限切れ',
    cancelled: '取消し',
    unknown: '結果不明',
  };
  return labels[status] ?? status;
}
