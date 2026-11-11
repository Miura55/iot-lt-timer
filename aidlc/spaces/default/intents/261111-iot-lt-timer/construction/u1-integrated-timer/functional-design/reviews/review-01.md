## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-11T16:55:36Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > 状態モデル・開始・障害回復と時刻端点 | 完了条件が図の「deadlineかつ全通知終端」と本文の「0秒通知がなければdeadlineで完了」で一致しない。例えば残り1秒の通知が未確定なら期限はdeadlineの4秒後まで残るため、本文どおり先にcompletedにするとrunningを条件にする回復送信ができない。また登録対象は各通知だけで、通知0件のdeadline完了や失われた起床・claimを照合する処理の起動契機が定義されていない。「終了確定は最大5秒」という上限も照合開始の保証なしでは確定しない。 | 完了条件をdeadline到達かつ全通知終端へ統一する。通知0件を含めて完了を駆動するバックエンドの起動契機と、予定登録漏れ・期限切れclaim・期限到達を照合する処理の起動契機と時間上限を定める。通知がdeadline直前に未確定の場合と、ブラウザーを閉じ通知0件の場合を手順で示す。最大5秒を保証できないなら回復遅延を含む表示へ修正する。 | New |
| R-02 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/entities.md > ScheduledNotification.entity_constraints、functional-spec.md > 起床とベル命令送信5、rules.md > BR1.9–BR1.10 | エンティティの正本は「ambiguousが一度でも確定した通知は最終unknown」とする一方、処理手順は期限内の同一命令再試行で受付が確定すればその結果を採用し、BR1.10もacceptedならsentとする。同じ命令で最初の要求がタイムアウトし次の要求が明確に受理された場合、unknownとsentのどちらへ保存するか正本間で矛盾する。 | 同じcommandIdの明確な受付を後続試行で確認したらsentにできるのかを統一する。少なくとも「曖昧な試行後の受付確認」「曖昧な試行後の拒否だけ確認」「期限まで未確定」の3経路をデータ制約・状態遷移・業務ルールで一致させる。受付確認がない場合をfailedまたはexpiredに誤変換しない。 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/functional-design/functional-spec.md > API・画面との対応、entities.md > ScheduledNotification.status | 内部通知状態にdispatchingを追加したが、公開C1 Notification.statusはpending/sent/failed/expired/cancelled/unknownのみである。GET stateで内部状態をそのまま返すのかpending等へ投影するのかが記載されていないため、処理中の照会で公開スキーマに合わない値を返す実装が生じ得る。 | 内部dispatchingを公開pendingへ投影する等の明示的な対応表を追加し、送信処理中のGET stateもC1のスキーマに適合することを検証対象にする。公開状態を増やす場合は共有契約側と消費画面を整合させる。 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| PowerShellによる受け入れ条件・ルール参照の検査 | U1担当の5ストーリーに含まれる20条件を20行で列挙。未列挙条件、実在しないBR参照、追跡されないBRはいずれも0件 | 対応表の構造と参照先はそろっている。動作の整合性は上記指摘の修正が必要 |
| 上流契約と状態遷移の読取り照合 | C2はrunningを送信前提とし、C1にはdispatching状態なし。通知期限は予定時刻+5秒 | 完了時刻・公開状態の指摘は共有契約の具体的条件に基づく |
| 段階定義の確認 | 専用の実行検証コマンド指定なし。実装コード・TS/JS断片なし | コードテスト・実機試験は実施対象外。兄弟Unitの構築資料は参照していない |

### Summary

認可・入力検証・同時実行制約・冪等開始・期限付き送信の責任は明確で、U1の担当範囲と追跡表もそろっている。承認に際しては、完了・照合処理を実際に駆動する手順と、再試行後の送信結果を正本間で一致させる2点を判断する必要がある。これらは実装前に解消することが望ましい。
