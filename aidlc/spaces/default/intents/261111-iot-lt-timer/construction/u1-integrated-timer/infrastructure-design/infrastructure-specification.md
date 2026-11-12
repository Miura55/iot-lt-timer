# U1 インフラ構成

入力: [U1性能設計](../nfr-design/performance-design.md)、[U1セキュリティ設計](../nfr-design/security-design.md)、[U1拡張・容量設計](../nfr-design/scalability-design.md)、[U1信頼性設計](../nfr-design/reliability-design.md)、[U1観測性設計](../nfr-design/observability-design.md)、[U1論理コンポーネント](../nfr-design/logical-components.md)、[ドメイン構成](../../../inception/domain-design/components.md)、[U1機能仕様](../functional-design/functional-spec.md)、[連携仕様C1/C2/C3](../../../inception/contract-design/contract-summary.md)。

初期対象は東京リージョン、1会場・ベル1台・同時1セッションである。月額500円を目安として小さく構成するが、実利用量・ログ量・Step Functions遷移数により変動し、予算内を保証しない。金額アラートを設定し、超過時の自動停止は行わない。

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| Compute model | 静的WebはAmazon S3 + Amazon CloudFront。API・期限起床・照合処理はAWS Lambda (Node.js/TypeScript)。 | 常時稼働サーバーを持たず、小規模で変動するイベント利用に合わせる。 |
| Networking topology | ap-northeast-1のマネージドサービスを使用。CloudFrontから非公開S3オリジンへOAC接続。API Gateway HTTP APIはHTTPS公開。LambdaはVPC外。 | 初版にNAT Gatewayやプライベートサブネットを追加すると固定費・運用面の負担が増える。データストアとAWSサービス境界はIAM・TLSで保護する。 |
| Storage strategy | DynamoDB on-demand。会場別設定、active session参照、session/notification/idempotencyを条件付き書込とトランザクションで保存する。CloudWatch Logsは7日保持。 | 条件付き更新と低頻度利用に合わせ、容量予約を避ける。監査記録の保持要件に合わせてログを短期保持する。 |
| Environments | `dev` と `prod` をCDK環境設定で分離し、リソース名・IoTトピック・認証プールを混在させない。初回イベント前の実機確認は`dev`相当で行う。 | 開発中の模擬受信と実機接続の誤送信を分ける。複数アカウント化はアカウント準備後に判断する。 |
| IaC approach | AWS CDK v2 / TypeScript。環境別contextを用い、Stack outputsにAPI URL、CloudFront URL、Cognito情報、IoT endpoint/topicを出力する。秘密値は出力しない。 | 承認済みのTypeScript CDKを利用し、構成差分と再配備をコード管理する。 |
| Resource sizing | Lambdaは小さい初期メモリ・短いtimeoutで開始し、APIは10秒以内のクライアント待機上限に合わせ過剰な同期処理をしない。DynamoDBはオンデマンド。 | 負荷の基準は1会場・1同時session・最大10通知。計測後に調整する。 |
| Edge and frontend | S3 private bucket + CloudFront distribution + Origin Access Control。SPA fallbackと長期immutable asset / 短期HTML cacheを分ける。初期URLはCloudFront既定ドメイン。 | カスタムドメインは未指定。APIはHTTPSのAPI Gateway endpointを環境設定から利用する。 |
| Identity | Cognito User Pool、自己登録無効、管理者による招待。HTTP API JWT authorizerはissuer/audienceを固定する。principalからvenue grantをサーバー側で解決する。 | 招待制の少人数利用という要件に合い、独自パスワード保管を避ける。ログイン画面はCognito Hosted UIまたはSDK連携を実装計画で確定する。 |
| Wait and recovery | Step Functions Standardがsession deadlineと各notification scheduledAtのWaitを行い、LambdaでDynamoDB状態を再確認して処理する。EventBridge Schedulerの1分周期が独立照合Lambdaを起動する。 | wait起床を時間管理に使い、永続状態を正本にする。期限起床消失時も定期照合で復旧できる。 |
| Bell transport | Dispatcher Lambdaの実行ロールは環境固定のAWS IoT Core `commands` topicへの`iot:Publish`のみ許可。QoS 1、retain=false。Pico証明書のIoT policyはデバイス固有の接続・購読topicに限定する。 | C3契約に従い、AWS受付と受信・物理鳴動を区別する。 |
| Secrets and encryption | TLSを使用し、DynamoDB・S3・CloudWatch Logsの暗号化を有効にする。IoT秘密鍵はPico内で管理し、アプリやログへ取り込まない。GitHub ActionsはOIDC、長期AWSキー不使用。 | 鍵・token・payloadをソース、CDK output、ログに含めない。 |
| Cost controls | AWS Budgetsで月額500円相当の通知を設定し、80%・100%でメール通知する。通知先登録が必要。Cost allocation tag `Project=iot-lt-timer`, `Environment=dev|prod` を付ける。 | クレジット適用前の利用額を把握する。Budgetは通知のみで、リソースの停止・削除をしない。 |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| Amazon S3 | 静的ファイル保存 | 非公開bucket、CloudFront OACのみ読み取り、versioningはデプロイ/復旧要件に応じ選択。 | ユーザー入力や認証tokenを保存しない。 |
| Amazon CloudFront | CDN / ingress | HTTPS、既定ドメイン、OAC、SPA route fallback、セキュリティヘッダー。 | カスタムドメイン・ACM証明書は後続設定。 |
| Amazon API Gateway HTTP API | API ingress | JWT authorizer、HTTPS、CORSを画面のoriginに限定、適切なthrottling。 | WAFは初版では置かず、公開範囲や脅威が拡大する時に再評価。 |
| AWS Lambda | compute | TypeScript handlersを機能境界ごとに分け、実行timeout・予約同時実行は初期は控えめに設定。 | API、Wait起床、照合の役割を分けて観測しやすくする。 |
| Amazon Cognito User Pool | identity | 自己登録無効、管理者招待、MFAは運用開始前に有効化を検討。JWT issuer/audienceをAPIで固定。 | 初期の招待メール送信設定と送信上限をAWSアカウントで確認する。 |
| Amazon DynamoDB | database | on-demand、暗号化、PK/SKで会場・session・notification・idempotencyを分離。条件付き書込とTransactWriteでactive session・claimを保護。TTLは不要データの保持要件を確認してから適用。 | PITRは追加費用を確認のうえprodで有効化する判断点。初期データ量が小さくても耐久状態を正本とする。 |
| AWS Step Functions Standard | workflow / wait | sessionごとのdeadline起床とnotificationごとの起床。Wait後は保存状態・世代・期限を再確認し、冪等なLambdaを呼ぶ。 | Waitの実行時間は最大期間以内であり、実行再開と状態保存はDynamoDBで管理する。外部publishと完全原子性は仮定しない。 |
| Amazon EventBridge Scheduler | scheduled recovery | 毎分の定期照合を起動。Scheduler service roleは照合Lambdaをinvokeする権限に限定。 | 走査処理はページングし、due/lease/sessionの修復はDynamoDB条件付き更新で排他する。 |
| AWS IoT Core | message broker | TLS MQTT、device-specific X.509 certificate、QoS 1、retain=false。commands topic ACLをdev/prodで分離。 | Picoが準備できるまではadapter/mocked brokerで確認。AWS受付は鳴動成功を示さない。 |
| Amazon CloudWatch | monitoring | JSON logs、7日retention、custom metricsとdashboard、metric/alarm設定。 | メトリクスに秘密値やpayloadを含めない。メール通知は運用連絡先が決まってから購読する。 |
| GitHub Actions | CI/CD | PRでformat/lint/typecheck/unit/integration/coverageを実行。main merge後にdevへCDK deploy、productionは手動承認後。AWS OIDC trustを特定repo/branchに限定。 | GitHub repository identity・環境保護・AWS role ARNを配備前に設定する。 |

## Wait registration and reconciliation

TimerSessionとScheduledNotificationには`wakeStatus`（pending/registered/failed）、`wakeAttempt`、`wakeExecutionName`、`wakeInputHash`、`wakeRegisteredAt`、`wakeLastError`を保存する。キーはtarget ID + generation + purpose + attemptから決定し、Step Functions Standardのexecution nameと完全なinputを再試行で再利用する。`StartExecution`の応答が曖昧な場合は同じnameの実行状態を照合し、未受付が確定するまでattemptを進めない。明確なterminal failure時だけ、DynamoDB条件付き更新でattemptを進めて新しいnameを作る。登録成功は条件付き更新で`registered`に記録する。

EventBridge Schedulerの毎分照合Lambdaは`pending/failed`登録と期限切れlease・期限到達状態をページングして検索し、同じ決定キーで登録を回復する。複数の同一Waitが走っても、起床Lambdaはgeneration/stateを再読込して条件付きlease claimを得た一処理だけが副作用を行う。セッションdeadline起床は通知の有無にかかわらず作成し、通知ごとの起床はscheduledAtに作成する。通常完了と回復完了の目標は信頼性設計のdeadline+65秒、または`max(deadline, latest notification expiresAt+65秒)`（終了時通知時deadline+70秒）を用い、AWSハードリアルタイム保証とはしない。

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|---|---|---|---|
| Cognito User Pool / API / DynamoDB / Step Functions / IoT topic | U1 | U2, U3 | 同一API・永続状態・実行所有者を維持。Lambda roleとvenue grantでアクセスを制限し、後続Unitが独自に状態を書かない。 |
| CloudFront distribution / S3 web bucket | U1 | U3 | 画面の配布先として共用。CI deploy roleだけが書込可能。 |

## Cost and operational assumptions

予算確認時はクレジット適用前の利用額をAWS Cost Explorer/Budgetsで見る。概算条件は東京リージョン、月100 session以下、各session最大10 notification、7日ログ保持、常時稼働EC2/NATなし、Step Functions Standardを1 sessionあたり約25 transition以内、1分照合Lambdaを月約44,000回以下とする。この条件ではStep Functionsは月2,500 transitionで現行の月4,000無料枠内、Lambdaは100万request/月の無料枠内に収まり、DynamoDB・S3・CloudFrontの小容量利用も無料枠または従量単価の小さい範囲が見込まれる。CloudWatch Logs取り込み/保持、CloudWatch alarms/custom metrics、Cognitoメール、配信データ量により無料枠外となり、月額は数百円から500円超まで変動し得る。Step Functions Standardはtransition課金で月4,000無料枠後に課金され、Lambdaにもrequest・実行時間の無料枠があるため、環境の無料枠適用状況を配備時に確認する。予算超過時も自動停止しない。価格・無料枠は変更され得るため、配備直前に東京のAWS Pricing Calculatorで再計算し、保証額として扱わない。

概算の根拠: [Step Functions料金](https://aws.amazon.com/step-functions/pricing/)、[Lambda料金](https://aws.amazon.com/lambda/pricing/)、[DynamoDB料金](https://aws.amazon.com/dynamodb/pricing/)。

## NFR infrastructure coverage

| ID | Infrastructure mapping |
|---|---|
| NFR1.1 | Step Functions Standard + Lambda + EventBridge Scheduler + AWS IoT Core。実機の打音時刻はアプリ外も含め運用記録で測定する。 |
| NFR1.2 | Dispatcher Lambdaの期限判定、DynamoDBの状態、IoT publish期限を連携する。 |
| NFR1.3 | API Gateway HTTP API、Lambda timeout、クライアント側Idempotency-Keyの契約。10秒は性能SLOではない。 |
| NFR1.4 | CloudFront配信の画面がAPIを約2秒間隔で取得する。ポーリング自体はブラウザー実装。 |
| NFR2.1 | DynamoDBの耐久状態、条件付き書込、TransactWriteを使う。 |
| NFR2.2 | Step Functions Standardのdeadline WaitとDynamoDBのserver UTC deadlineを使用し、ブラウザー切断に依存させない。 |
| NFR2.3 | Step Functions起床後にDynamoDBのgeneration・state・leaseを再検査し、IoT publishはcommandIdで冪等化する。 |
| NFR2.4 | Session Deadline Wait、通知Wait、EventBridge Scheduler毎分の照合Lambda。正常起床と回復目標は[U1信頼性設計](../nfr-design/reliability-design.md)を参照する。 |
| NFR2.5 | LambdaからのIoT QoS 1 publish、固定commandId、DynamoDBへの累積試行結果保存。期限後は送信しない。 |
| NFR2.6 | API Gateway/Lambdaが公開状態を返し、CloudFront UIが通信失敗・通知結果・最終更新を区別する。 |
| NFR3.1 | Cognito JWT authorizerとサーバー側venue grant照合。 |
| NFR3.2 | CloudFront/API Gateway HTTPS、AWS service TLS、IoT MQTT TLS。 |
| NFR3.3 | GitHub OIDC、Lambda実行role、Secrets Manager/SSM Parameter Storeで秘密管理。ログ・CDK outputsに秘密を含めない。 |
| NFR3.4 | Lambda IAMをtable/topic単位に限定し、Pico証明書ポリシーをdevice-specific topicに制限する。 |
| NFR3.5 | API Gateway request limitsとLambdaのschema/value validation。安全なCORSと公開エラーを設定する。 |
| NFR3.6 | Cognito self-signup無効、管理者招待のUser Pool。 |
| NFR5.1 | API Gateway requestIdとLambda structured logs、session/notification IDで相関する。 |
| NFR5.2 | Dispatcher LambdaとIoT Core受付の結果・遅延メトリクスを記録し、実打音は計測対象に偽装しない。 |
| NFR5.3 | CloudWatch Logs retention 7日。 |
| NFR5.4 | Structured logging allowlistとpayload/credential除外設定。 |
| NFR5.5 | CloudWatch custom metrics、dashboard、alarmでpending/dispatching・期限超過・照合失敗を観測する。 |
| NFR6.1 | GitHub Actionsでunit/境界integrationをAWS credentialsなしで実行する。 |
| NFR6.2 | GitHub Actions coverage gateでアプリTS/JSの行カバレッジ80%を確認しIaCを除外する。 |
| NFR6.3 | GitHub ActionsのPR checks、CDK synth/assertions、OIDCによるdev deployと手動承認付きprod deploy。 |
