<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-13T01:16:13Z [unit u2-timer-controls] — Infrastructure reviewはNOT-READY。traceabilityの一部がNFRと不一致、missing wake/expired lease queryが未決、CIに320px/keyboard/accessibility検査が不足とされた。コード生成ではGSIを推測追加せず既存RecoveryIndex queryを確認し、frontend/infraテストに画面要件を含める。

2026-11-13T00:00:00Z — 東京リージョン・月額500円目安・招待制Cognito・TypeScript CDKを反映。コストは低利用想定でも保証せずBudgetsで通知する。

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-13T01:16:13Z [unit u2-timer-controls] — 新しいAWS resourceは追加せずU1のshared stack、table、workflow、毎分reconciler、監視を拡張する。資料中のNFR traceabilityは24行を機械確認したが、レビューで対応先の意味不一致が見つかったため、Implementation/Build and Test時に実装ファイルへのtraceを再確認する。

2026-11-13T00:00:00Z — User Pool/CI OIDC/API Gateway hostingなどアカウント固有の設定値は未提供のため、配備手順の前提として明示し、環境値をコードへ固定しない。

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-13T01:16:13Z [unit u2-timer-controls] — recovery candidatesは既存sparse RecoveryIndexを使い、全table scanや追加GSIコストを避ける。具体的なquery条件とindex projectionは既存repository実装と合わせる。

2026-11-13T00:00:00Z — Lambda/DynamoDB/S3/CloudFrontのマネージド構成としNAT Gateway/常時稼働computeを避ける。Step Functions Standardは信頼できる待機を提供するが遷移数が変動費となる。

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->

2026-11-13T00:00:00Z — GitHub repository identity、AWS account、Budgets通知先、Pico実機のIoT証明書・endpointを初回配備前に設定する。
