# LT Timer

スマートフォンのブラウザーから使う、AWSバックエンド管理のLTタイマーです。設定した残り時間にベルを鳴らし、終了時刻に向けて複数の通知を行えます。ベル端末はAWS IoT CoreへMQTT接続する想定で、ファームウェアはこのリポジトリには含まれません。

## 主な機能

- タイマー時間と通知時刻、各通知の打音回数（1〜3回）を設定
- 一時停止、再開、キャンセル
- Cognito認証と会場単位の操作権限
- サーバー側で時刻を管理し、Step Functionsと定期リコンシリエーションで通知を実行・復旧
- スマートフォン向けのWeb UI

## 構成

```text
スマートフォンのブラウザー
  ├─ CloudFront + S3 (Web UI)
  └─ API Gateway HTTP API + Cognito JWT
       └─ Lambda ─ DynamoDB (タイマー状態、操作レシート)
            ├─ Step Functions Wait ─ Lambda (通知時刻)
            ├─ EventBridge (毎分の復旧処理)
            └─ AWS IoT Core MQTT ─ Raspberry Pi Pico (ベル端末)
```

AWSリソースはAWS CDKで定義しています。`dev` と `prod` の環境をサポートし、料金予算アラームもスタックに含まれます。

## 開発環境

- Node.js 22
- npm
- AWS CDKを使った合成・デプロイにはAWS CLI認証情報が必要

```sh
npm ci
npm run dev
```

Viteは `http://localhost:5173` でWeb UIを起動します。接続先APIをローカル環境変数 `VITE_API_URL` に設定してください。未設定の場合、Web UIは同一オリジンの `/v1` を呼び出します。

### 検証コマンド

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:u1
npm run test:u2
npm run test:coverage
npm run build
```

CDKテンプレートの合成:

```sh
cd infra
npm run synth -- -c environment=dev
```

## AWS環境

CDKスタックは `infra/` にあります。CIではPull Requestごとにフォーマット、lint、型チェック、テスト、カバレッジ、ビルド、CDK合成を実行します。`main` へのpushで開発環境、`workflow_dispatch` で本番環境のデプロイを行う設定です。デプロイにはGitHub ActionsのOIDCロール設定が必要です。

ユーザープールのセルフサインアップは無効です。利用者はCognitoユーザープールに管理者が追加します。ブラウザー向け設定（API URL、Cognito User Pool IDなど）は `/v1/config` から取得されます。

## ベル端末のMQTT契約

Lambdaは次のトピックへQoS 1、retain無効で通知コマンドをpublishします。

```text
lt-timer/v1/{environment}/bells/{bellId}/commands
```

コマンド例:

```json
{
  "schemaVersion": 1,
  "commandId": "notification-id",
  "sessionId": "timer-session-id",
  "ringCount": 3,
  "intervalMs": 500,
  "scheduledAtMs": 1794650410000,
  "expiresAtMs": 1794650415000
}
```

端末は有効期限を過ぎたコマンドを鳴らさず、`commandId` を使って重複配送による二重打音を防いでください。1回の打音間隔は500msです。実機ファームウェアの実装と動作確認は別途必要です。

## リポジトリ構成

- `apps/web/` — React + ViteのWeb UI
- `apps/api/` — Lambda API、通知dispatcher、復旧処理
- `packages/domain/` — タイマー状態遷移と共通型
- `infra/` — AWS CDKスタック
- `tests/` — U1/U2単体・統合テスト
- `aidlc/` — AI-DLCの設計記録、判断、レビュー
