# U2 インフラ構成

入力: [U2性能設計](../nfr-design/performance-design.md)、[U2セキュリティ設計](../nfr-design/security-design.md)、[U2スケーラビリティ設計](../nfr-design/scalability-design.md)、[U2信頼性設計](../nfr-design/reliability-design.md)、[U2観測性設計](../nfr-design/observability-design.md)、[U2論理コンポーネント](../nfr-design/logical-components.md)、[ドメイン構成](../../../inception/domain-design/components.md)、[U2機能仕様](../functional-design/functional-spec.md)、[連携仕様](../../../inception/contract-design/contract-summary.md)、[U1インフラ構成](../../u1-integrated-timer/infrastructure-design/infrastructure-specification.md)。

U2はU1の東京リージョン・1会場・同時1セッション構成を共有する。新しいDB、VPC、常時稼働ホスト、MQTT topicは追加しない。月額500円は目安で、実利用・ログ・CloudWatch監視・無料利用枠の適用条件で変動する。AWS Budgetsによる予算通知や自動停止は行わない。

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| Compute model | U1のAPI Gateway HTTP API / Node.js TypeScript Lambdaへpause・resume・cancel routeを追加。既存TimerControl worker/Lambdaへversion検証、状態遷移、operation receipt確定、resume後のwake登録を追加する。 | 低頻度のイベント利用に合わせ、常時稼働基盤と新規サービスを避ける。AWS応答待ちは操作APIの成功条件にせず、耐久化後にwake/reconcilerが処理する。 |
| Networking topology | U1のHTTPS公開API、LambdaのVPC外実行、CloudFrontのprivate S3 origin/OACを継承。新しいingress、NAT、VPC endpointを作らない。 | U2は既存AWSサービス内の処理追加であり、ネットワーク分離を要する新規データ層を持たない。 |
| Storage strategy | U1 DynamoDB on-demand tableへTimerSessionの`pendingOperation`、U1と同じ形状のoperation receipt、期限/登録状態を保存。version/state/generationとlease tokenを条件付き更新する。receipt TTLは7日。 | 同じsession状態・操作結果を一つのrepository境界で整合させ、並行操作とlease回復を安全にする。 |
| Environments | U1の`dev`と`prod`を共有し、table、state machine、scheduler、Cognito、IoT topicは環境別prefix/ARNを維持する。初回イベント前の検証はdev相当で行う。 | 模擬実行と実機向けtopicを分離し、誤送信を防止する。 |
| IaC approach | U1のAWS CDK v2 / TypeScript stackへroute・Lambda権限・DynamoDB access・CloudWatch設定を追加する。U2専用stackや同じ資源の二重定義を行わない。 | 共有資源ownerであるU1の定義を拡張し、stack間の循環依存を避ける。 |
| Resource sizing | 1会場・active session 1件・通知最大10件。API Lambdaは既存timeout境界内で状態遷移とreceiptを確定し、wake登録後処理は非同期回復を使う。DynamoDBはon-demand。 | 追加負荷は小規模の状態変更と1分ごとの照合候補に限定される。大規模同時実行の保証はしない。 |
| Edge and frontend | U1 CloudFront distribution/S3 bucketへU2制御UIを同じWeb appとして配布。APIは同一HTTPS endpoint、認証トークンはU1のCognito flowを使う。 | U2は独立アプリ・別公開URLを必要としない。 |
| Identity | U1 Cognito User Pool、自己登録無効、HTTP API JWT authorizerを継承。各pause/resume/cancelでサーバー側に`operate` permissionを確認する。 | ブラウザーだけに権限判定を委ねない。 |
| Wait and recovery | U1 Step Functions Standard state machineでresume後のdeadlineとpending通知wakeを登録。U1 EventBridge Schedulerの毎分reconcilerを拡張し、欠落wakeと期限切れ`pendingOperation`を候補限定で回復する。 | deadlineはサーバー保存値を正とし、イベント/ブラウザーの時計から独立させる。 |
| Bell transport | U1 Dispatcher Lambda、AWS IoT Core、環境固定のC3 `commands` topic、QoS 1、retain=falseを共有。dispatcher roleは必要topicへのpublishだけを許可する。 | pause/cancelは既にpublish済みの命令を撤回できない。AWS受付と物理鳴動を同一視しない。 |
| Secrets and encryption | U1 TLS、DynamoDB/S3/CloudWatch暗号化、Cognito秘密情報管理、GitHub Actions OIDCを継承する。IoT秘密鍵はPico内のみ。 | U2が新たな共有鍵を扱わず、既存の最小権限境界を保つ。 |
| Cost controls | AWS Budgetsアラームは作成せず、receipt TTL 7日・Logs 7日を維持する。CloudWatch custom metrics/alarmsとCI実行量の実額を確認する。 | U2で専用常時稼働資源は増えないが、監視メトリクスとLambda処理量により実費は増える。金額・無料枠適用を保証しない。 |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| Amazon API Gateway HTTP API | ingress | 既存Cognito JWT authorizer、U2 pause/resume/cancel route、schema/size validation、HTTPS、既存CORS allowlist。 | principalとvenue grantをserver-sideに解決する。 |
| AWS Lambda (Node.js / TypeScript) | compute | 既存API / control / wake / dispatcher handlersを更新。API実行時間を抑え、外部IoT publishはdispatcher境界に限定。 | `Operate`操作に必要なDynamoDB、Step Functions、IoT topicだけへIAM grant。 |
| Amazon DynamoDB | database | 既存on-demand tableと同一PK/SK設計を継承。session単位のpending operation/recovery fields、7日operation TTL。GSI追加は実装前に具体的なquery keyと費用を確認し、全表scanを避ける。 | U1共有ownerがschemaとCDKを変更し、U2はrepository API経由で利用。 |
| AWS Step Functions Standard | wait / queue | 既存workflowでresumeの新generation deadlineとpending通知を登録。決定的execution name/inputでStartExecutionの曖昧応答を照会。 | 古いgenerationはworkerの永続状態照合でno-op。 |
| Amazon EventBridge Scheduler | scheduled reconciliation | 既存1分周期を維持し、missing/failed wake・期限切れleaseだけを候補化し上限付き処理。 | スケジュールは東京リージョンの単一環境ごとに1つ。全sessionを毎分総当たりしない。 |
| Amazon Cognito User Pool | identity | 招待のみ、self-signup無効、issuer/audience固定JWT。 | U1共用。 |
| AWS IoT Core MQTT | messaging | U1 C3 topic、TLS、QoS 1、retain=false。dev/prodで分離。 | AWS publish受付は鳴動確認ではない。 |
| Amazon CloudWatch | monitoring | JSON structured logs 7日保持、低カードinality custom metrics、U1のdashboard/alarmsを拡張。 | 長期保存、PII、command payloadは記録しない。 |
| GitHub Actions | CI/CD | PRでformat/lint/typecheck/test/coverage/CDK synth/assertions。main統合後dev deploy、prod deployは手動承認。 | 環境保護とAWS OIDC role設定を前提とする。 |

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|---|---|---|---|
| Cognito User Pool / API Gateway / Lambda / DynamoDB / Step Functions / EventBridge Scheduler / IoT topic / CloudWatch | U1 | U2, U3 | U1がCDK・schema所有者。U2は同じAPI/repository/control worker境界の拡張として使い、U2専用table・state machine・topicを作らない。各roleは必要なroute/data/action/topicだけ許可。 |
| CloudFront distribution / S3 web bucket / GitHub Actions deployment environments | U1 | U2, U3 | U1のweb deploy roleとrelease pipelineが公開先を所有。PR CIはAWS資格情報を使わない。 |

## NFR infrastructure coverage

NFRごとの具体的資源・非適用理由は[traceability.json](traceability.json)に記録する。数値SLO、DR RTO/RPO、厳密な一回publish保証は追加しない。
