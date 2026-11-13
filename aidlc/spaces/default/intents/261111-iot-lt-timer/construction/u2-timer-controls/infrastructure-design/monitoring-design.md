# U2 監視設計

入力: [U2可観測性設計](../nfr-design/observability-design.md)、[U2信頼性設計](../nfr-design/reliability-design.md)、[U2機能仕様](../functional-design/functional-spec.md)、[U1インフラ構成](../../u1-integrated-timer/infrastructure-design/infrastructure-specification.md)。

U1 CloudWatch Logs、metrics、dashboardを拡張する。初期のCloudWatch閾値は計測後に調整し、鳴動成功をAWSログから推定しない。

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|---|---|---|---|
| Control API 2xx / 4xx / 5xx by route | API Gateway access logs / Lambda structured logs | 初期は件数表示のみ。5xxの継続発生をalarm候補とする | pause/resume/cancelの可用性と拒否原因を区別する。 |
| `IN_PROGRESS`, `VERSION_CONFLICT`, `INVALID_STATE` count | TimerControl Lambda | dashboard表示。個別ユーザーの競合頻度を確認 | 再照会と重複クリックの発生傾向を把握する。 |
| Expired pending operation leases / oldest age | Reconciler Lambda | lease期限超過が複数回連続または古い候補がNFR回復目標を越えた場合に通知。実閾値はdev観測で決定 | 操作receiptを確定できないまま残す故障を早期検知する。 |
| Wake registration pending/failed/ambiguous and repair result | Wake registrar/reconciler logs | terminal failureが照合周期を越えて残る場合に通知 | resume deadline/notificationの欠落を検知する。 |
| Reconciler candidate count, duration, exception | EventBridge invocation / Lambda | exceptionまたは上限処理が継続して未処理候補が残る場合に通知 | 60秒照合の進行と負荷を把握する。 |
| Notification pending/sent/failed/expired/unknown | Dispatcher state/logs | unknownが増加または期限越えに残る場合に運用確認 | AWS受付結果と未確定状態を明確にする。sentはIoT Core受付である。 |
| DynamoDB throttles / transaction conflict / consumed capacity | DynamoDB metrics | 初版はdashboardと標準service alarm | 条件付き更新失敗・容量の偏りを検出する。 |

## Alerts

| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| API server error | U2 API 5xxが連続し、初期thresholdを超える | P2 | AWS Budget/CloudWatch通知先。連絡先確定まではCloudWatch alarm stateで確認 |
| Expired operation recovery | lease期限切れpending operationがreconciler複数回後も未確定 | P2 | 運用手順に従いsession状態とreceiptを照合 |
| Wake recovery failure | Step Functions登録がterminal failureで再登録後も失敗 | P2 | execution name、generation、attemptを使って調査 |
| Reconciler failure | invocation error、処理上限反復、候補滞留 | P2 | CloudWatch logs/metricsを確認し、状態回復後に再処理 |
| Unknown notification result | expiry後もunknownが確定または割合上昇 | P3 | 会場画面の「送信結果不明」を確認。実機鳴動の目視確認へ引き継ぐ |

通知メール先は運用連絡先の確定後に購読する。未設定時に有効な通知があるかのように扱わない。

## SLIs / SLOs

| SLI | SLO target | Measurement window |
|---|---|---|
| Operation response durable before 200 | 100% observed responses must follow durable state/receipt commit; this is a correctness invariant, not availability SLA | All U2 operation requests |
| Wake recovery after confirmed registration failure | 60秒照合内に再試行対象へ検出する運用目標。AWS execution開始時刻の保証ではない | Per failure event |
| Operation recovery target | lease expiry + 60秒照合を用いる目標。厳密な完了SLAではない | Per pending operation |
| Physical ring success | No server-side SLO; require venue-side visual/physical confirmation | Each event |

## Logs & Tracing

LambdaはCloudWatch LogsへJSON形式で`requestId`, `sessionId`, `operationKey`または`notificationId`, `route`, `version`, `generation`, `resultCode`, `timestamp`を記録する。API Gateway request idをLambdaまで渡し、同一操作のrequestとreconcileを相関する。JWT、cookie、AWS credential、IoT payload全体、principalの個人情報は出力しない。ログ保持は7日、operation/notification状態のTTLは7日とする。

DashboardはAPI route別結果、期限切れlease、wake repair、reconciler滞留、notification outcome、DynamoDB throttling、Budget利用額を表示する。Pico ACKや物理的な打音を示す項目は設けない。
