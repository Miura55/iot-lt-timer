# U1 論理コンポーネント

入力: [既存ドメイン構成](../../../inception/domain-design/components.md)、[U1機能仕様](../functional-design/functional-spec.md)、[C1/C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。論理境界であり、AWSリソース選定はInfrastructure Designに委ねる。

| 論理部品 | 責任・所有データ | 境界・障害影響 |
|---|---|---|
| Operator Web UI | スマートフォン向け設定・開始・状態表示、ポーリング、古い応答の破棄 | HTTPS/C1。停止してもバックエンドタイマーと通知予定は継続。 |
| Authenticated API | token検証、principal→venue認可、入力/冪等性/競合検査、応答投影 | HTTPS境界。認証不可なら操作を拒否し、成功扱いしない。 |
| Timer Control | TimerSessionの状態・deadline・version/generation、会場のactive session所有 | APIと永続状態の整合を調停。条件付き書込に失敗した開始は受理しない。 |
| Notification Planner / Dispatcher | ScheduledNotification、期限起動、lease claim、IoT publish、結果分類 | Timer Control/永続状態およびAWS IoT境界。重複起床は許容し、leaseとcommandIdで重複鳴動を抑制。 |
| Reconciliation | 登録失敗、期限切れlease、起床消失、完了待ちsessionを検出して状態再評価 | 60秒ごとに走査。期限起床消失時は通知なしならdeadline+65秒、通知ありならmax(deadline, latest expiresAt+65秒)以内の永続化を目標とする。 |
| Session Deadline Wait | 各TimerSessionのdeadlineで一度起床し完了判定を実行 | 通知0件も含めて通常完了を駆動する。起床消失はReconciliationが補う。 |
| Durable State Store | session、notification、idempotency、event/audit記録 | 全処理の正本。単一実行プロセス障害後も復元可能。 |
| AWS IoT / Pico Bell | MQTT受信、期限検証、重複排除、物理ベル駆動 | C3非同期境界。v1ではアプリへ受信/鳴動ACKを返さない。 |
| Operations Telemetry | 相関ログ、メトリクス、保持期限、運用アラート | 秘密・payloadを除外。計測障害でもタイマー状態の正本にしない。 |

処理の要点: Web UI → Authenticated API → Timer Control → Durable State Store。Notification Planner/Dispatcherは保存済み計画と期限起動から状態をclaimし、AWS IoTへ送信する。Reconciliationは独立して保存状態を照合する。実装コンポーネントのコード所有権はDomain Designのcomponents.mdを維持し、ここではその境界をNFR視点で整理した。

## 品質ゲート境界

GitHub Actionsはformat/lint、型検査、test-afterのunit/境界結合テスト、coverage計測を実行する。対象はWeb/API/ドメイン/IoT adapterのアプリケーションTypeScript/JavaScriptで、80%未満またはいずれかの失敗をmain統合の拒否条件とする。Infrastructure DesignでOIDC権限・workflow triggers・検査実装を具体化する。

## 詳細NFRと設計対象

| 詳細要件ID | 設計対象 |
|---|---|
| NFR1.1 | Step Functions、Lambda、AWS IoT Coreおよび実機30回の測定目標を[performance-design.md](performance-design.md)に定義。 |
| NFR1.2 | Dispatcherの期限判定とPico側の期限検査を[reliability-design.md](reliability-design.md)で連携。 |
| NFR1.3 | APIの待機上限とIdempotency-Keyを[performance-design.md](performance-design.md)で定義。 |
| NFR1.4 | Operator Web UIの表示・取得間隔を[performance-design.md](performance-design.md)で定義。 |
| NFR2.1 | DynamoDB相当の耐久保存、条件付き更新、トランザクションを[reliability-design.md](reliability-design.md)に定義。 |
| NFR2.2 | サーバーdeadlineとStep Functions deadline waitを[reliability-design.md](reliability-design.md)に定義。 |
| NFR2.3 | generation照合、条件付きclaim、stable commandIdを[reliability-design.md](reliability-design.md)に定義。 |
| NFR2.4 | session deadline wake、notification wake、60秒reconciliationと期限起点の復旧式を[reliability-design.md](reliability-design.md)に定義。 |
| NFR2.5 | 同一commandId/payloadの期限内再試行と累積結果分類を[reliability-design.md](reliability-design.md)に定義。 |
| NFR2.6 | 公開pending投影、通信状態・最終更新表示を[reliability-design.md](reliability-design.md)に定義。 |
| NFR3.1 | principalからvenue grantへのサーバー認可を[security-design.md](security-design.md)に定義。 |
| NFR3.2 | browser/API、AWS service、MQTTのTLSを[security-design.md](security-design.md)に定義。 |
| NFR3.3 | OIDC/role/secret管理とログ除外を[security-design.md](security-design.md)に定義。 |
| NFR3.4 | 最小権限API・DynamoDB・IoT topicを[security-design.md](security-design.md)に定義。 |
| NFR3.5 | API入力検証、CORS、エラー境界を[security-design.md](security-design.md)に定義。 |
| NFR3.6 | 招待制認証・自己登録無効を[security-design.md](security-design.md)に定義。 |
| NFR5.1 | request/session/notification IDを使う構造化ログを[observability-design.md](observability-design.md)に定義。 |
| NFR5.2 | publish受付と実機鳴動を分けた結果メトリクスを[observability-design.md](observability-design.md)に定義。 |
| NFR5.3 | 7日保持後のログ削除を[observability-design.md](observability-design.md)に定義。 |
| NFR5.4 | token/certificate/payloadを記録しないログ制約を[observability-design.md](observability-design.md)に定義。 |
| NFR5.5 | pending/dispatching、期限超過、完了待ち、照合結果の計測を[observability-design.md](observability-design.md)に定義。 |
| NFR6.1 | test-afterのunit/境界integration testを[performance-design.md](performance-design.md)に定義。 |
| NFR6.2 | アプリTS/JSの80%行カバレッジとIaC除外を[performance-design.md](performance-design.md)に定義。 |
| NFR6.3 | GitHub Actions、失敗時merge拒否、OIDCを[performance-design.md](performance-design.md)に定義。 |

Functional Designの状態表示、通知結果優先順位、session完了式、起床登録の冪等回復は更新済みであり、[functional-spec.md](../functional-design/functional-spec.md)を実装時の振る舞い正本とする。
