# U1 監視・運用設計

入力: [U1観測性設計](../nfr-design/observability-design.md)、[U1信頼性設計](../nfr-design/reliability-design.md)、[U1機能仕様](../functional-design/functional-spec.md)、[AWS構成](infrastructure-specification.md)。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|---|---|---|---|
| API request count, 4xx/5xx, p95 latency | API Gateway access log / Lambda EMF | 5xxが継続または急増したら調査。API 10秒はクライアント待機上限でSLOではない。 | 認証・API・永続化障害の早期検知。 |
| `WaitRegistrationFailure` | workflow start/registration Lambda | 1件以上で運用確認 | 予定起床欠落は通知遅延・完了遅延につながる。 |
| `NotificationPublishAccepted`, rejected, ambiguous | Dispatcher Lambda | rejected/ambiguousが1件以上で画面表示と照合対象 | AWS受付結果とデバイス実動作を分離する。 |
| `NotificationExpired`, `NotificationUnknown`, `NotificationFailed` | Dispatcher / Reconciliation Lambda | イベント前は1件でも確認。 | 鳴らなかった可能性や遅延を隠さない。 |
| `DueNotificationAgeSeconds` / `LeaseAgeSeconds` | Reconciliation Lambda | `expiresAt`超過を警告、`expiresAt+65s`超過を目標逸脱として重大扱い | 期限内再試行と終端状態確定の目標を確認する。 |
| `SessionCompletionDelaySeconds` | deadline handler / reconciliation | 通知なしはdeadline+65s、通知ありはmax(deadline, latest expiresAt+65s)を超過で警告 | 保存状態の回復目標を追跡する。 |
| `ReconciliationScanFailure`, scan count | Reconciliation Lambda | 1回失敗で警告、連続失敗で重大アラーム | 独立修復経路が止まった状態を見つける。 |
| `IoTConnectionOrPublishError` | Dispatcher Lambda / IoT metrics | 1件以上をダッシュボード表示。イベント前にゼロであることを確認。 | MQTTサービス境界の障害を追う。 |

メトリクスはrequestId、sessionId等の高カーディナリティ識別子をdimensionにしない。識別子は構造化ログだけに含め、metric dimensionはservice/environment/result等に限定する。

## Alerts

| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| API error rate | 5xxの連続発生または急増 | Warning | CloudWatch dashboard/alarm。メール先は運用者登録後にSNS subscriptionを追加。 |
| Wait registration failed | deadline/notification起床登録失敗 >= 1 | Critical | CloudWatch alarm。イベント前は手動確認。 |
| Notification recovery overdue | 保存状態が非終端のdue/leaseのまま、recovery target（通知expiresAt+65秒）を超過 | Critical | CloudWatch alarmと相関ログ確認。命令期限は延長しない。 |
| Notification outcome unknown | 終端status=unknownが1件以上 | Warning | CloudWatch dashboardで対象を確認し、イベント運用者がベルを現地確認。unknownは終端状態でありsession完了を妨げない。 |
| Reconciliation unavailable | 連続して照合Lambda失敗またはScheduler invoke失敗 | Critical | CloudWatch alarm。保存状態から手動復旧。 |
| IoT publish rejected | 認可・endpoint・publish失敗 | Warning | CloudWatch alarm/dashboard。AWS受付を鳴動成功として扱わない。 |

## SLIs / SLOs

| SLI | SLO target | Measurement window |
|---|---|---|
| Scheduled notification first physical bell start | 初版運用目標は予定時刻から2秒以内。AWSだけで保証せず、実機で1/2/3打各10件、合計30件を記録し合格を判定。 | イベント前の実機30回。AWS受付・Pico受信・実打音の時刻を区別する。 |
| No-notification session completion | 正常deadline起床でdeadline時にcompleted。起床消失時はdeadline+65秒以内の状態確定を目標。 | 各イベント利用時、照合ログで計測。 |
| Session completion with notifications | deadline経過かつ全通知終端で完了。起床消失時はmax(deadline, latest expiresAt+65秒)以内を目標。 | 各session。終了時通知のexpiresAtはdeadline+5秒のため最悪deadline+70秒。 |
| API client wait | C1に従うクライアント待機上限10秒。API性能保証ではない。 | API Gateway access logs、手動試験。 |
| State display freshness | 実行中・停止中は約2秒ごとに取得し、最終取得時刻を表示。 | UI telemetry/ブラウザ確認。 |

## Logs & Tracing

LambdaはJSON形式でrequestId、sessionId、notificationId、attempt、generation、eventName、UTC時刻、before/after state、resultCode、durationMsを記録する。認証token、秘密鍵、certificate、全request body、command payloadは出さない。CloudWatch Logsは7日で失効させる。API Gateway request IDをLambdaへ伝播し、Lambda/X-Rayのtrace IDは相関ログで引き継ぐ。

DashboardはAPI error/latency、Lambda errors/throttles/duration、Step Functions failures/timed-out executions、Scheduler invoke failures、DynamoDB throttling/system errors、IoT publish結果、照合遅延、Budget actual/forecastを並べる。手動運用手順は、通知IDで状態・試行結果を追い、期限後の再publishを行わず、実機の鳴動は現地で目視・聴取確認する。アラームがないことやAWS受付はPicoオンライン・鳴動成功の証明ではない。
