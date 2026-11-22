# U1 信頼性設計

入力: [信頼性要件](../nfr-requirements/reliability-requirements.md)、[機能仕様](../functional-design/functional-spec.md)、[C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。

## 永続状態と起床

- 成功応答より先にsession、deadline、通知計画、冪等性結果を耐久保存する。会場のactive session作成は条件付き更新、通知のclaimはversion/generation/期限を条件にしたlease付き更新で排他する。
- 通知の有無にかかわらず、各sessionにはdeadline起床を登録する。通常時はその起床ハンドラーが期限時にsessionをcompletedへ永続化し、0通知でもブラウザーに依存しない。通知ごとのWaitはscheduledAtにDispatcherを起こす。各登録の決定キーは対象ID + generation + attemptとする。同じattemptの再試行は同じexecution name/inputを使い、受付不明時はその名前の実行状態を照合する。確定したterminal failure後のみ、保存済みattemptを条件付き更新して新しいキーを発行する。複数Waitが起動しても状態再読込と条件付きclaimにより副作用は一度だけになる。独立照合は未登録・失敗・起床消失を検出する。
- 各通知の起床は保存状態を再確認し、重複・早着・順不同・古いgenerationを安全に無視する。期限起動は単独で正本にならず、永続ストアが判断の正本。
- スケジュール登録状態とattemptを永続記録する。未登録のsession deadline/notification wakeは毎分照合で再登録する。期限切れclaimはlease expiry後に照合し、publish開始を否定できる場合に限り期限内で再開する。
- 独立した照合経路は60秒ごとにdue通知・期限切れlease・完了待ちsessionを走査し、保存状態から修復可能な処理を再起動する。開始点は常に当該期限（通知ならexpiresAt、通知なしならsession.deadline）とする。期限起床が失われた場合、次回走査まで最大60秒、処理時間に5秒の予算を加え、**開始点+65秒以内**の状態永続化を運用目標にする。これはAWSサービスのハードリアルタイム保証ではない。

## IoT配信と曖昧結果

QoS 1、retain=false、stable commandId、UTCのscheduledAtMs/expiresAtMs、Pico側期限検証と重複排除を維持する。publishは期限5秒未満のときだけ試し、曖昧結果は期限前に同一ID・同一payloadで再試行する。試行結果は累積し、いずれかがAWS受付ならsent、受付がなく曖昧な結果が残れば期限でunknown、曖昧さがなく全試行の拒否が確定した場合のみfailed、未試行の期限切れはexpiredとする。回復走査は既存命令の期限を延長せず、期限後はpublishしない。

## 完了・復旧

完了条件は通知0件ならdeadline起床時にcompleted、通知ありならdeadline経過かつ全通知がsent/failed/unknown/expired/cancelledになってからcompletedとする。期限起床消失時の運用目標は通知0件でdeadline+65秒、通知ありでmax(deadline, 最新notification.expiresAt+65秒)。終了時通知はexpiresAt=deadline+5秒なので最悪deadline+70秒となる。APIの状態取得・新規開始は、deadline後に通知がない／全て終端なら期限を過ぎた古いactive記録を論理完了へ進めてから処理する。これにより起床消失が新しい発表の開始を永久に阻害しない。

Standard WorkflowのWaitは絶対時刻・秒精度の待機に適し、実行可能期間は最大1年だが、その起床だけで永続データや外部publishの原子性を得るものではない。[AWS Step Functions Wait公式資料](https://docs.aws.amazon.com/step-functions/latest/dg/state-wait.html)。
