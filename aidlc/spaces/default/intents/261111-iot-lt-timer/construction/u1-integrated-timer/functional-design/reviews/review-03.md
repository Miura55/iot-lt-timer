## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-12T15:36:49Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > 状態モデル・開始・障害回復と時刻端点 | 完了条件が図の「deadlineかつ全通知終端」と本文の「0秒通知がなければdeadlineで完了」で一致しない。例えば残り1秒の通知が未確定なら期限はdeadlineの4秒後まで残るため、本文どおり先にcompletedにするとrunningを条件にする回復送信ができない。また登録対象は各通知だけで、通知0件のdeadline完了や失われた起床・claimを照合する処理の起動契機が定義されていない。「終了確定は最大5秒」という上限も照合開始の保証なしでは確定しない。 | 完了条件をdeadline到達かつ全通知終端へ統一する。通知0件を含めて完了を駆動するバックエンドの起動契機と、予定登録漏れ・期限切れclaim・期限到達を照合する処理の起動契機と時間上限を定める。通知がdeadline直前に未確定の場合と、ブラウザーを閉じ通知0件の場合を手順で示す。最大5秒を保証できないなら回復遅延を含む表示へ修正する。 | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/entities.md > ScheduledNotification.entity_constraints、functional-spec.md > 起床とベル命令送信5、rules.md > BR1.9–BR1.10 | エンティティの正本は「ambiguousが一度でも確定した通知は最終unknown」とする一方、処理手順は期限内の同一命令再試行で受付が確定すればその結果を採用し、BR1.10もacceptedならsentとする。同じ命令で最初の要求がタイムアウトし次の要求が明確に受理された場合、unknownとsentのどちらへ保存するか正本間で矛盾する。 | 同じcommandIdの明確な受付を後続試行で確認したらsentにできるのかを統一する。少なくとも「曖昧な試行後の受付確認」「曖昧な試行後の拒否だけ確認」「期限まで未確定」の3経路をデータ制約・状態遷移・業務ルールで一致させる。受付確認がない場合をfailedまたはexpiredに誤変換しない。 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > API・画面との対応、entities.md > ScheduledNotification.status | 内部通知状態にdispatchingを追加したが、公開C1 Notification.statusはpending/sent/failed/expired/cancelled/unknownのみである。GET stateで内部状態をそのまま返すのかpending等へ投影するのかが記載されていないため、処理中の照会で公開スキーマに合わない値を返す実装が生じ得る。 | 内部dispatchingを公開pendingへ投影する等の明示的な対応表を追加し、送信処理中のGET stateもC1のスキーマに適合することを検証対象にする。公開状態を増やす場合は共有契約側と消費画面を整合させる。 | Resolved (reviewer) |

> R-01 Reviewer note: functional-spec.md、entities.md、BR1.11/BR1.12でsession専用deadline起床と60秒周期照合を明記した。通知0件は正常deadline起床で完了、回復目標はdeadline+65秒。通知ありはdeadline到達かつ全通知終端で完了し、回復目標をmax(deadline, 最新expiresAt+65秒)へ統一した。終了通知でdeadline+70秒になることを記し、旧deadlineから最大65秒という矛盾した表現は残っていない。

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| PowerShellによる対象記述確認 | 旧deadlineから最大65秒の表現なし。deadline+70秒と、曖昧な登録応答で同一キー照合を行う記述あり | 時間目標の修正と登録回復の方針を確認した |
| 登録状態・再試行の正本照合 | TimerSessionにdeadlineWakeStatus/Attempt、ScheduledNotificationにwakeStatus/Attemptを定義。同じ対象・generation・用途・attemptではキーと入力を固定し、曖昧結果ではattemptを進めず、失敗確定後だけ条件付きで進める | 受付されたか不明な登録を別実行として増やさず回復できる。起床が重複しても永続状態の再検査と条件付きclaimにより論理通知の副作用を重複させない構成になっている |
| PowerShellによる追跡先照合 | U1の上流条件20件、OKのBR参照先欠落0件 | 追跡の参照整合性を維持する |
| 結果分類・公開契約の読取り照合 | 受付ありはsent、受付なしで曖昧ならunknown、全拒否かつ曖昧なしはfailed。dispatchingは公開pendingへ投影 | 先行で修正した優先順位を維持し、C1の公開状態enumを増やしていない。命令の5秒期限も回復目標で延長しない |

### Summary

今回の論理機能設計は承認可能。正常な期限起床と回復経路を分け、通知0件と終了時通知の両方の完了条件・回復目標が一致している。起床登録の曖昧応答・確定失敗・再送と、起床後の副作用抑止も別々の責任として定義されている。

本確認は設計資料の整合確認であり、AWS StartExecutionや実機の実行試験ではない。具体的な登録照合API、実行名への変換、サービスの入力制限と実測遅延は、インフラ設計と実装試験でこの論理契約へ対応させる必要がある。
