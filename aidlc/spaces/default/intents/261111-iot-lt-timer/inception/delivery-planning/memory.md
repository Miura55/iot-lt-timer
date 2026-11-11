<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-11T16:35:42Z — 最初はU1で画面から模擬ベル受信までの最小一連動作を通す。依頼者はUnit単位・依存順・直列を選び、実機は11月13日までに試せる見込みと回答したが確約ではない。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-11T16:35:42Z — 正式な点数付けより依存順とリスクを採用した。U1→U2→U3のDAGを保ち、模擬接続を先行して実機準備の遅れを開発全体の停止につなげない。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-11T16:35:42Z — イベントの正確な開始時刻、AWS開発アカウント・認証方式・接続情報、Picoの実機準備完了は未確認。Infrastructure Designと実機試験計画で解消する。
