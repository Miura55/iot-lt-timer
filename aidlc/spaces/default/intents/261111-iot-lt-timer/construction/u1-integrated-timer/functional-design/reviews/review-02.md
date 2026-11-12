## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-12T14:48:23Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > 状態モデル・開始・障害回復と時刻端点 | 完了条件が図の「deadlineかつ全通知終端」と本文の「0秒通知がなければdeadlineで完了」で一致しない。例えば残り1秒の通知が未確定なら期限はdeadlineの4秒後まで残るため、本文どおり先にcompletedにするとrunningを条件にする回復送信ができない。また登録対象は各通知だけで、通知0件のdeadline完了や失われた起床・claimを照合する処理の起動契機が定義されていない。「終了確定は最大5秒」という上限も照合開始の保証なしでは確定しない。 | 完了条件をdeadline到達かつ全通知終端へ統一する。通知0件を含めて完了を駆動するバックエンドの起動契機と、予定登録漏れ・期限切れclaim・期限到達を照合する処理の起動契機と時間上限を定める。通知がdeadline直前に未確定の場合と、ブラウザーを閉じ通知0件の場合を手順で示す。最大5秒を保証できないなら回復遅延を含む表示へ修正する。 | Unresolved |
| R-02 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/entities.md > ScheduledNotification.entity_constraints、functional-spec.md > 起床とベル命令送信5、rules.md > BR1.9–BR1.10 | エンティティの正本は「ambiguousが一度でも確定した通知は最終unknown」とする一方、処理手順は期限内の同一命令再試行で受付が確定すればその結果を採用し、BR1.10もacceptedならsentとする。同じ命令で最初の要求がタイムアウトし次の要求が明確に受理された場合、unknownとsentのどちらへ保存するか正本間で矛盾する。 | 同じcommandIdの明確な受付を後続試行で確認したらsentにできるのかを統一する。少なくとも「曖昧な試行後の受付確認」「曖昧な試行後の拒否だけ確認」「期限まで未確定」の3経路をデータ制約・状態遷移・業務ルールで一致させる。受付確認がない場合をfailedまたはexpiredに誤変換しない。 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > API・画面との対応、entities.md > ScheduledNotification.status | 内部通知状態にdispatchingを追加したが、公開C1 Notification.statusはpending/sent/failed/expired/cancelled/unknownのみである。GET stateで内部状態をそのまま返すのかpending等へ投影するのかが記載されていないため、処理中の照会で公開スキーマに合わない値を返す実装が生じ得る。 | 内部dispatchingを公開pendingへ投影する等の明示的な対応表を追加し、送信処理中のGET stateもC1のスキーマに適合することを検証対象にする。公開状態を増やす場合は共有契約側と消費画面を整合させる。 | Resolved (reviewer) |

> R-01 Reviewer note: 完了条件を「deadline到達かつ全通知終端」に統一し、60秒周期の照合とexpiresAt+65秒目標を明示した点は改善済み。ただしfunctional-spec.mdの状態モデル説明に「completedはdeadlineを越えて最大65秒」と残る。終了通知ではexpiresAt=deadline+5秒なので、新目標から導く完了時刻はdeadline+70秒であり両者は一致しない。また通知0件をdeadlineで完了させる通常の起動契機は依然として記載がなく、各通知の起床と60秒周期照合だけではdeadline時点の永続状態変更を説明できない。期限到達用の内部起動、または読取・開始時に論理的完了を評価する規則を明記し、保存反映が遅れた場合も次の開始を不当に拒否しないことを定める。65秒の起点を全記述でexpiresAtへそろえる。

> R-02 Reviewer note: entities.mdのdispatchOutcomeにaccepted > ambiguous > rejected > not_attemptedの累積優先順位が定義された。functional-spec.mdの送信手順・状態図とBR1.9/BR1.10も、いずれか受付ならsent、受付なしで曖昧さが残れば期限でunknown、曖昧さがなく全試行拒否ならfailedと一致している。

> R-03 Reviewer note: entities.mdとfunctional-spec.mdの状態図補足にdispatchingを公開pendingへ写像すると明記され、C1の公開通知enumを増やさずに処理中を表現する方針になった。

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| PowerShellによるC1スキーマ読取り | 公開通知状態はpending/sent/failed/expired/cancelled/unknown | 内部dispatchingのpending投影は既存スキーマに適合する |
| 期限式の具体例照合 | 終了通知のscheduledAt=deadline、expiresAt=deadline+5秒、終端確定目標=expiresAt+65秒=deadline+70秒 | 状態モデル説明のdeadline+65秒という残存表現は修正が必要 |
| PowerShellによる追跡表照合 | 上流20条件、coverage20行、OKのBR参照先欠落0件 | 追跡の構造と参照先は維持されている |
| C2/C3との読取り照合 | 送信前のrunning再確認、予定から5秒未満だけ送信、安定commandId、受付と実鳴動の分離を維持 | 全通知終端を待つ方針と受付優先の結果分類に新たな契約不一致は確認しない。回復による状態確定が遅れても命令の有効期限は延長しない |

### Summary

受付結果の優先順位と公開状態の投影は解消された。完了条件も主要な矛盾は取り除かれたが、回復上限の起点と通知0件の完了を実際に駆動する経路は残る判断事項である。回復目標はexpiresAt+65秒という運用目標として扱い、ハードリアルタイム保証や命令期限延長と解釈しない。
