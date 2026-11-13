# U2 信頼性設計

入力: [信頼性要件](../nfr-requirements/reliability-requirements.md)、[U2機能仕様](../functional-design/functional-spec.md)、[U2データモデル](../functional-design/entities.md)、[U1データモデル](../../u1-integrated-timer/functional-design/entities.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

## 状態・操作の正本

TimerSessionとScheduledNotificationはU1の正本を共有し、条件付き書き込みで`version`, `generation`, `state`を制御する。U1の`operationResults: List<OperationReceipt>`を拡張し、別EntityとしてのTimerOperationReceiptをランタイムで作らない。OperationReceiptの確定フィールドはU1同一形状とし、operation未確定中に必要な回復情報（operation key、route、sessionId、principalId、expectedVersion、requestFingerprint、lease token、leaseExpiresAt）はTimerSessionの任意`pendingOperation`に保存する。これはU1モデルに対するU2の明示的拡張としてCode Generationへ渡す。

```text
OperationReceipt = { idempotencyKey, route, requestFingerprint,
                     responseStatus, responseBody, expiresAt }
PendingOperation = { idempotencyKey, sessionId, principalId, route,
                     expectedVersion, requestFingerprint, leaseToken,
                     leaseExpiresAt }
```

同じkeyでの要求は先にreceiptを検索する。確定済みならresponseStatus/responseBodyを再生し、進行中はC1の409 `IN_PROGRESS`を返す。未確定operationがlease失効した場合、reconcilerはsessionとnotificationの状態を読む。session版が期待版のままなら条件付き遷移を再試行し、遷移がすでに適用済みならその結果をresponseBodyとしてreceipt化し、別操作で版が進んでいれば409 `VERSION_CONFLICT`として確定する。決定できない外部dispatchはunknownを保持し、別操作を再実行しない。

## Resume時のwake登録

Resumeの条件付き永続化は`state=running`, 新deadline, `generation+1`, `version+1`, pendingOperation情報を一つのトランザクションで保存する。transaction成功後にdeadline wakeとpending通知wakeを新generationで登録する。実行名はsessionId/notificationId + generation + attemptの決定的値、入力は同じgenerationのdeadline/scheduledAt/expiresAtとする。登録応答が不明ならattemptを進めず既存executionを照会し、終端失敗（FAILED/TIMED_OUT/ABORTED）と確認できた場合だけ条件付きattempt更新を行う。

60秒reconcilerは、running sessionで登録状態がpendingまたは失敗かつwakeが無いもの、及びexpired leaseのpendingOperationを回復する。旧generationのwakeは永続state照合でno-opになる。通知dispatchの安定commandId・期限・累積結果はU1 BR1.7–1.10を維持する。

## Pause/Cancelと外部送信の競合

操作とnotification claimは同一のsession version / notification statusを条件とした更新で順序付ける。操作が先にcommitされた場合、後着claimはstate/generation不一致でpublishしない。dispatch claimが先にcommitされた場合、既存commandの結果またはexpiryまでpause/cancelをpendingにする。HTTP上限10秒を越えたら同じkeyの409 IN_PROGRESSを返し、lease recoveryが最終応答を完成させる。publish結果unknownを理由にclaimを新しいcommandIdへ振り替えない。

## 復旧と劣化動作

| 障害 | 回復 |
|---|---|
| Worker停止前に操作遷移なし | lease期限後に同じkeyを読み、期待version一致なら同じ条件付き遷移を実行。 |
| 遷移後、receipt確定前に停止 | sessionのversion/state/generationから結果を再構成し、U1 OperationReceiptを完成。 |
| Step Functions登録応答不明 | deterministic execution name/inputを照会。結果不明中は同一attemptを保つ。 |
| wake登録失敗確定 | attemptを条件付き増加し、60秒以内の照合で再登録。 |
| 送信claim後のIoT応答不明 | U1 BR1.9に従い同一commandIdで期限内に限定再試行し、期限後はunknown。 |
| Repository利用不可 | 状態変更成功を返さず503。クライアントは同一keyとGET stateで復旧する。 |

可用性、DR RTO/RPO、厳密な一回送信を保証しない。サーバー時刻と永続状態を唯一の制御根拠とする。
