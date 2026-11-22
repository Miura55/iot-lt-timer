# U2 スケーラビリティ設計

入力: [スケーラビリティ要件](../nfr-requirements/scalability-requirements.md)、[性能要件](../nfr-requirements/performance-requirements.md)、[U2機能仕様](../functional-design/functional-spec.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

- 初版はvenueあたりactive session 1件・最大10通知に合わせ、session単位で状態と通知を読み書きする。操作receiptはsessionに紐づけ、7日TTLで削除する。
- 高頻度の全表scanを行わず、wake registration欠落・operation lease期限切れだけを回復対象indexから限定走査する。候補数はsession上限により制限する。
- Lambda/API/Step Functions/DynamoDB候補はマネージドサービスの水平拡張を利用するが、高い同時実行数や多会場容量を性能目標にしない。
- 条件付き書き込みの競合は版番号・generationごとに局所化する。同じsessionへの操作は直列化し、別venueの並列化は将来要件として扱う。
- DynamoDB等の具体パーティションキー・scan rate・同時実行上限はInfrastructure Designで費用と一緒に確定し、リソース上限を越える設定を安全に失敗させる。

スケーリング前提はNFR2.4/2.5に記録した初版容量に限る。利用量増加時は単一session集約の競合とTTL量を観測し、追加会場要件に合わせて再設計する。
