# U1 論理コンポーネント

入力: [既存ドメイン構成](../../../inception/domain-design/components.md)、[U1機能仕様](../functional-design/functional-spec.md)、[C1/C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。論理境界であり、AWSリソース選定はInfrastructure Designに委ねる。

| 論理部品 | 責任・所有データ | 境界・障害影響 |
|---|---|---|
| Operator Web UI | スマートフォン向け設定・開始・状態表示、ポーリング、古い応答の破棄 | HTTPS/C1。停止してもバックエンドタイマーと通知予定は継続。 |
| Authenticated API | token検証、principal→venue認可、入力/冪等性/競合検査、応答投影 | HTTPS境界。認証不可なら操作を拒否し、成功扱いしない。 |
| Timer Control | TimerSessionの状態・deadline・version/generation、会場のactive session所有 | APIと永続状態の整合を調停。条件付き書込に失敗した開始は受理しない。 |
| Notification Planner / Dispatcher | ScheduledNotification、期限起動、lease claim、IoT publish、結果分類 | Timer Control/永続状態およびAWS IoT境界。重複起床は許容し、leaseとcommandIdで重複鳴動を抑制。 |
| Reconciliation | 登録失敗、期限切れlease、起床消失、完了待ちsessionを検出して状態再評価 | Dispatcherとは別の回復経路。起動頻度・SLOは未確定事項。 |
| Durable State Store | session、notification、idempotency、event/audit記録 | 全処理の正本。単一実行プロセス障害後も復元可能。 |
| AWS IoT / Pico Bell | MQTT受信、期限検証、重複排除、物理ベル駆動 | C3非同期境界。v1ではアプリへ受信/鳴動ACKを返さない。 |
| Operations Telemetry | 相関ログ、メトリクス、保持期限、運用アラート | 秘密・payloadを除外。計測障害でもタイマー状態の正本にしない。 |

処理の要点: Web UI → Authenticated API → Timer Control → Durable State Store。Notification Planner/Dispatcherは保存済み計画と期限起動から状態をclaimし、AWS IoTへ送信する。Reconciliationは独立して保存状態を照合する。実装コンポーネントのコード所有権はDomain Designのcomponents.mdを維持し、ここではその境界をNFR視点で整理した。

**未解決設計依存:** 完了条件・再照合頻度上限・曖昧publish結果の最終状態・dispatchingの公開状態投影はFunctional DesignのMajor指摘により確定前。これらを解消するまでシーケンスや完了SLOを固定しない。
