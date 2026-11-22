# U2 可観測性設計

入力: [可観測性要件](../nfr-requirements/observability-requirements.md)、[信頼性要件](../nfr-requirements/reliability-requirements.md)、[U2機能仕様](../functional-design/functional-spec.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

## 相関ログとカウンター

すべてのAPI・wake・reconcilerログに`sessionId`, `operationKey`または`notificationId`, `route`, `version`, `generation`, `requestId`, `resultCode`, `timestamp`を含める。操作本文・JWT・cookie・device certificate・AWS credential・MQTT payload全体は出力しない。

観測する値は次に限定し、初期閾値はInfrastructure Designで実トラフィックと費用を見て決める。

- pause/resume/cancelの受理・409競合・403拒否・503件数
- lease失効operationの件数、最古経過時間、reconcilerの成功/失敗
- wake登録pending/terminal failure/曖昧結果、generation別修復件数
- notificationのpending/sent/failed/expired/unknown件数。sentはAWSサービス受付を表す
- 60秒reconcilerの実行時刻、処理候補数、duration、例外

7日保持後に操作・通知記録を削除する。Pico ACKや実鳴動成功を示す指標は作らない。
