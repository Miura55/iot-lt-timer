<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-11T17:05:55Z [unit u1-integrated-timer] — 既存認証基盤なしという回答を受け、招待制マネージド認証を提案として記載した。本人確認方法・実装先はAWS選定に依存するためInfrastructure Designで確定する。
- 2026-11-12T14:54:47Z [unit u1-integrated-timer] — 利用者が承認した65秒回復目標の起点は通知expiresAt。通知なしのdeadline回復はdeadline+65秒、終了通知の回復はexpiresAt+65秒（deadline+70秒）として区別する。
- 2026-11-12T18:56:01Z [unit u2-timer-controls] — NFR2の65秒回復目標と60秒照合を継承し、resumeでのwake登録不明・欠落、lease期限切れ操作の照合、U1 OperationReceipt共有を追加要件にした。U2は1会場・active session 1件の初版上限を変えない。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-11T17:05:55Z [unit u1-integrated-timer] — TypeScript/ReactとAWS Step Functions・永続ストアを候補として提示し、具体サービスはこの段階で固定しなかった。イベント期限と月500円目安を費用試算と一緒に後続設計で比較する。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-11T17:05:55Z [unit u1-integrated-timer] — 待機登録・期限到達・失効claimを見つける再照合起動契機、権限発行者、実際のAWS費用、CI配置は未確定。Functional Designレビューの完了・再試行結果・dispatching投影の指摘もまだ正本へ反映されていない。
- 2026-11-12T14:54:47Z [unit u1-integrated-timer] — NFR2.4/2.5へ回復スキャンと送信結果の優先順位を反映した。Functional Designに残る完了遅延の算式・通知0件の起床経路を次の正本更新で一致させ、レビューを再確認する。
