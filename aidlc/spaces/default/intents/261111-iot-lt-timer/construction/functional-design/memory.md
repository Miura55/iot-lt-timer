<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-11T16:56:48Z [unit u1-integrated-timer] — タイマー表示が0になった時点で終了通知がpendingなら、結果確定までセッションをrunningで残す。これにより共有契約のrunning再検査とremainingAtRing=0の通知を両立する。
- 2026-11-12T14:47:45Z [unit u1-integrated-timer] — 利用者の決定により、通知回復はexpiresAtから65秒以内を目標とする。内部dispatchingは公開APIのpendingに写像し、画面で「送信処理中」と示す。
- 2026-11-12T15:36:17Z [unit u1-integrated-timer] — 時間起点を通知0件はdeadline、通知ありはmax(deadline, latest expiresAt+65秒)に統一し、終了時通知はdeadline+70秒となる。通常完了をsession deadline起床で駆動する。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-11T16:56:48Z [unit u1-integrated-timer] — MQTT結果不明時は依頼者の選択に従い同じcommandIdを有効期限内でのみ再試行する。Picoの重複排除を利用し、期限後の不確かな再送を防ぐ。
- 2026-11-12T14:47:45Z [unit u1-integrated-timer] — 曖昧な試行の後でも、いずれかの同一commandId試行でAWS受付が確認できればsentとする。受付不明と実機鳴動の不確実性は別に保つ。
- 2026-11-12T15:36:17Z [unit u1-integrated-timer] — 起床登録は対象・generation・attemptから決まるkey/inputを使う。同じ試行を再送し、terminal failure確認後のみ条件付きでattemptを増やす。重複起床は永続状態の再読込とclaimで抑える。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-11T16:56:48Z [unit u1-integrated-timer] — 待機・永続化・排他claimの具体的なAWS構成はInfrastructure Designへ引き継ぐ。U2でpause/resume/cancelとdispatch claim競合の実装設計を拡張する。
