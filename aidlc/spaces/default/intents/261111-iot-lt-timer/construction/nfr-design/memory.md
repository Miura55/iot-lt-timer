<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-12T15:00:41Z [unit u1-integrated-timer] — 利用者決定に合わせ、期限回復の起点をnotification.expiresAtとした。通知0件はdeadline+65秒、通知ありはmax(deadline, latest expiresAt+65秒)を運用目標とする。
- 2026-11-12T15:44:41Z [unit u1-integrated-timer] — 機能仕様へ期限起床の通常経路とdeadline+70秒の終了通知回復上限を反映し、NFR設計の保留文を同期した。全24詳細NFR IDを論理部品の追跡表へ明記。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-12T15:00:41Z [unit u1-integrated-timer] — 各sessionのdeadline Waitに加えて60秒周期の独立照合を置く。追加の定期処理コストと引き換えに、ブラウザーを閉じた場合や起床欠落から期限状態を回復できる。
- 2026-11-12T15:44:41Z [unit u1-integrated-timer] — 予定登録の重複コストを抑えるため対象ID・generation・attemptから決定的キーを作り、同じ試行の再送は同じ入力を使う。起床の重複副作用は保存状態と条件付きclaimで防ぐ。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-12T15:00:41Z [unit u1-integrated-timer] — Functional Designの「deadlineを越えて最大65秒」表現は通知終端のexpiresAt+65秒と整合しない。コード生成へ進む前に、正本を「通知なしdeadline+65秒、終了通知ありdeadline+70秒を含むmax(deadline, latest expiresAt+65秒)」へ揃える。
- 2026-11-12T15:44:41Z [unit u1-integrated-timer] — 解消: Functional Designの正本・NFR要件・NFR設計の期限式を一致させ、0通知のdeadline起床、C1のpending投影、再登録の冪等条件を追記した。
