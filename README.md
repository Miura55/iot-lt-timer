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

AWSリソースはAWS CDKで定義しています。`dev` と `prod` の環境をサポートします。月額500円は費用設計の目安で、AWS Budgetsによる予算アラームは作成しません。

## 開発環境

- Node.js 22.23.5
- npm
- AWS CDKを使った合成・デプロイにはAWS CLI認証情報が必要

```sh
nvm install 22.23.5
nvm use 22.23.5
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

`synth` は先にリポジトリ全体をビルドするため、生成物を手動で更新する必要はありません。

## AWS環境

CDKスタックは `infra/` にあります。AWSアカウントと東京リージョン（`ap-northeast-1`）を対象にデプロイします。初回はAWS CLIの認証情報を設定し、CDK Bootstrapを実行してください。

```sh
# AWS CLIでログイン済みであることを確認
npm ci                    # リポジトリのルートで初回、または依存関係の更新後に実行
aws sts get-caller-identity --profile <AWS_PROFILE> --query Account --output text

cd infra

# 初回のみ、対象アカウント・リージョンごとに実行
npx cdk bootstrap aws://<AWS_ACCOUNT_ID>/ap-northeast-1 --region ap-northeast-1 --profile <AWS_PROFILE>
```

`diff` と `deploy` は先にリポジトリ全体をビルドします。以下は `infra/` で実行してください。

```sh
npm run diff -- IotLtTimerDev -c environment=dev --region ap-northeast-1 --profile <AWS_PROFILE>
npm run deploy -- IotLtTimerDev -c environment=dev --region ap-northeast-1 --profile <AWS_PROFILE>
```

本番環境へデプロイする場合は、コマンドのスタック名と環境コンテキストを `IotLtTimerProd` / `prod` に変更してください。prodスタックはDynamoDBテーブルやCognitoユーザープールを保持する設定です。デプロイ後のAPIエンドポイントなどの出力は、AWS CloudFormationコンソールまたは次のコマンドで確認できます。

```sh
aws cloudformation describe-stacks --stack-name IotLtTimerDev --query 'Stacks[0].Outputs'
```

CIではPull Requestごとにフォーマット、lint、型チェック、テスト、カバレッジ、ビルド、CDK合成を実行します。`main` へのpushで開発環境、`workflow_dispatch` で本番環境をデプロイします。GitHub Actionsからのデプロイには、リポジトリの `AWS_ROLE_ARN` シークレットに設定したAWS OIDCロールが必要です。本番デプロイではGitHub Actionsの `production` Environmentを使用します。

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
