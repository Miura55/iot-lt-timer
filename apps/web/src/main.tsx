import React from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import './style.css';
import { App } from './timer-app.js';

async function bootstrap() {
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  const response = await fetch(`${apiUrl}/v1/config`, { cache: 'no-store' });
  if (!response.ok) throw new Error('アプリ設定を取得できません');
  const config = (await response.json()) as { userPoolId: string; userPoolClientId: string };
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: { email: true },
      },
    },
  });
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap().catch(() => {
  const root = document.getElementById('root');
  if (root)
    root.innerHTML =
      '<main class="shell"><section class="card"><h1>LTベルタイマー</h1><p role="alert">アプリ設定を読み込めません。ネットワークとAPIの設定を確認してください。</p></section></main>';
});
