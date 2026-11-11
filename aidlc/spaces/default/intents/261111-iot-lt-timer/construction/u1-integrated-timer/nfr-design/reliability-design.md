# U1 信頼性設計

入力: [信頼性要件](../nfr-requirements/reliability-requirements.md)、[機能仕様](../functional-design/functional-spec.md)、[C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。

## 永続状態と起床

- 成功応答より先にsession、deadline、通知計画、冪等性結果を耐久保存する。会場のactive session作成は条件付き更新、通知のclaimはversion/generation/期限を条件にしたlease付き更新で排他する。
- 各通知の起床は保存状態を再確認し、重複・早着・順不同・古いgenerationを安全に無視する。期限起動は単独で正本にならず、永続ストアが判断の正本。
- スケジュール登録の成否を記録し、登録失敗を再試行または明示障害として残す。期限切れclaimは lease expiry 後に照合し、publish開始を否定できる場合に限り期限内で再開する。
- 独立した照合経路は60秒ごとにdue通知・期限切れlease・完了待ちsessionを走査し、保存状態から修復可能な処理を再起動する。通常の期限起動が失われた場合、次回走査まで最大60秒、処理時間に5秒の予算を加えた**65秒以内の回復目標**を置き、超過をメトリクス・アラートにする。これはAWSサービスのハードリアルタイム保証ではなく、運用SLO候補である。

## IoT配信と曖昧結果

QoS 1、retain=false、stable commandId、UTCのscheduledAtMs/expiresAtMs、Pico側期限検証と重複排除を維持する。publishは期限5秒未満のときだけ試し、曖昧結果は期限前に同一ID・同一payloadで再試行する。AWS受付が確認できた試行が一つでもあれば契約上sent、拒否だけが確定すればfailed、期限まで結果が曖昧ならunknown、送信未開始のまま期限切れならexpiredとする。この規則は「AWSが受付したらsent」と「不明の再試行は同じcommandId」というC3/NFR2.5を優先する明示的な推奨解釈である。機能仕様・業務ルール・画面表示の対応を同じ規則に合わせる変更が必要。

## 完了・復旧の未解決条件

現機能仕様には「全通知が終端状態で完了」と「0秒通知なしならdeadlineで完了」が併記され、非0秒通知が期限後に再照合されるケースと整合しない。推奨案は全通知をsent/failed/unknown/expired/cancelledのいずれかに確定してからcompletedとし、0秒通知がある場合も期限切れ確定を待つこと。正常な期限起動では予定時刻+5秒、失われた起床の回復は期限+65秒を運用目標とする。これは既存の「最大5秒遅れ」を改訂する案で、承認済み要件ではない。Functional Designへの変更要求として完了条件、通知終端への写像、期限起動失敗の回復契機とこの上限を一つに定める必要がある。画面のdispatching→pending表示写像も同じ修正に含める。

Standard WorkflowのWaitは絶対時刻・秒精度の待機に適し、実行可能期間は最大1年だが、その起床だけで永続データや外部publishの原子性を得るものではない。[AWS Step Functions Wait公式資料](https://docs.aws.amazon.com/step-functions/latest/dg/state-wait.html)。
