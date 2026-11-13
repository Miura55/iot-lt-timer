# U1 コード生成サマリー

## 実装内容

- `packages/domain/` にタイマー設定検証、UTC期限計算、通知期限・回復期限、決定的なwake key、MQTT command生成と送信結果分類を実装。
- `apps/api/` にDynamoDB repository、Cognito JWT認証後の会場grant確認、`GET /v1/state`・`POST /v1/sessions`、Step Functions Standard wake登録、IoT Core QoS 1送信、毎分照合を実装。
- `apps/web/` にモバイル優先の設定・ログイン・タイマー状態画面を実装。Cognito runtime config、初回パスワード更新、複数ベル時刻、残り時間、送信結果、更新失敗と最終取得時刻を扱う。対話要素に`data-testid`を付けた。
- `infra/` にCDK構成を作成。招待制Cognito、HTTP API、Lambda、暗号化DynamoDB、Step Functions Standard、分毎EventBridge、IoT topic制限、S3/CloudFront OAC、CloudWatch保持とBudgetを定義。
- `.github/workflows/ci.yml` にCIと、設定済みOIDCロールを使用するdev自動配備・production手動Environment配備ジョブを追加。
- Lambdaは`iot:Data-ATS` endpointを`DescribeEndpoint`で自動取得し、HTTPS URLとしてIoT Data Plane SDKへ渡す。起床登録、Dispatcher起動、IoT publish試行・AWS例外を、payloadを含めずCloudWatch Logsへ構造化出力する。

## 主な判断

- DynamoDBを状態の正本とし、開始・通知claim・wake登録状態を永続化。wake名とinputはtarget ID・generation・purpose・attemptから決定する。同じattemptを再試行し、受付が曖昧な間はattemptを進めない。
- C1開始APIは`{settings: ...}`を受け取り、201と保存済みStateを返す。同一Idempotency-Keyの同一要求は保存済みStateを再返却し、異なる要求は409とする。セッション、冪等性応答を同一DynamoDB transactionで保存する。
- 通知claimは期限切れleaseかつpublish開始未記録の場合だけ再取得する。publish開始を条件付きで永続化し、開始後にleaseが切れた場合は受付不明として`unknown`で終端化し、二重送信を避ける。同一notification IDをcommandIdに保つ。
- DynamoDB Document Clientでundefined値を除去し、ドキュメント保存時にも再帰的にundefinedを取り除く。状態機械ARNは起床登録を使うAPI/照合Lambdaだけに渡し、Dispatcherの環境依存を避ける。
- 通知なしでもdeadline wakeを作成。通知期限は予定時刻+5秒。独立照合はwake登録だけでなく期限到達通知・deadlineを再処理し、通知の物理鳴動は保証しない。
- IoT命令は環境/ベル固定topicへQoS 1・retain=falseでpublishし、commandIdは通知ID、打音間隔は500ms。AWS受付はデバイス受信・実鳴動と区別する。
- Dispatcherの実行role topic ARNとLambdaのpublish topicは`lt-timer/v1/{environment}/bells/{bellId}/commands`で一致する。`IoTDataPlaneClient`にはHTTPS URLが必要なため、設定がhostname単独でもschemeを補う。
- v1の画面は開始・設定入力・状態確認まで。停止・再開・取消しはU2、次回用保存設定はU3に残した。
- CloudFrontの同一origin配下にAPI routeを置き、認証設定を`GET /v1/config`から取得する。CloudFront既定ドメインを使う。

## 検証結果

- `node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` — pass。
- `node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` — pass。
- `node_modules/.bin/tsc --noEmit -p infra/tsconfig.json` — pass。
- `npm run typecheck` — pass（domain packageを先にbuildした後）。
- `npm run typecheck` — pass（4パッケージ）。
- `npm run build` — pass（domain/API/web/infra）。sandbox内ではesbuildが親ディレクトリを読めず失敗したため、outside-sandbox実行で成功を確認。
- `npm exec vitest -- run tests/unit/u1 tests/integration/u1` — pass、6 test files / 37 tests。domain 9、service 9、dispatcher 7、wake-registrar 6、repository 2、config 4。IoT endpoint自動検出とSDK endpoint解決、topic/QoS/retain、SDK拒否診断ログを検証。
- テストランナー準備コマンド`npm exec vitest -- run --passWithNoTests tests/unit/u1`はnpm 12が`--passWithNoTests`をconfig flagとして扱い、EUNKNOWNCONFIGで失敗。通常のUnit test commandは19件pass。
- CDK CLIをinfra devDependencyへ追加し、CIのsynthコマンドをinfra workspace script経由に変更。`..\\node_modules\\.bin\\cdk.cmd synth -c environment=dev` — pass。CDKからdeprecated APIの警告が2件出るが、循環依存警告は解消。
- repositoryは権限判定と完了済み最新セッション参照のユニット検証を追加。HTTP handler/API全体、UI、CDK assertions、coverage計測は未実施。AWS/Pico接続も未実施。AWSへdeployしていない。
- ユーザー環境でのtest-client経由のpublish成功とアプリ経由の未着報告を受け、Lambdaから`DescribeEndpoint(iot:Data-ATS)`でアカウント固有endpointを取得する方式にした。手動の`IOT_ENDPOINT`環境変数を削除し、Dispatch/Reconcile Lambdaに`iot:DescribeEndpoint`を追加した。publish経路をCloudWatchで追う構造化ログも追加した。配備済みLambdaの実環境値やCloudWatchログは未確認のため、実環境での原因確定とは扱わない。

## 計画との差分・残作業

- 計画は各主要コンポーネントにつき5–8テストとCDK構成テストを目標にした。U1は31件を実行したが、API handler、UI、CDK assertion、80%カバレッジの証拠が不足している。実機のAC1.8.2/1.8.3はPico未準備のため未実施であり、traceabilityではDeferredとした。
- U1の統合機能を実装したが、DynamoDB Local等を使った永続化結合検証やAWS IoT実機試験、実機30通知の2秒目標計測は未実施。
- Cognito、bell ID、GitHub AWS OIDC role、Budget通知先など環境値は配備前に設定が必要。IoT endpointはLambdaが自動取得する。
