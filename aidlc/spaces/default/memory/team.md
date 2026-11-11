# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

## Way of Working

私たちは `main` を統合先とし、小さい変更を短期間の作業ブランチでまとめ、squash-merge する。個別のコミット依頼は現在のブランチで行う。

## Walking Skeleton

私たちは最初に全体がつながる最小構成を動かして接続を確認する。範囲と確認方法は設計・実装計画で決める。

## Testing Posture

- **Methodology**: test-after
- **Ordering**: 各テスト可能な層を実装してから、その層のテストを書いて実行する。
- **Methodology evidence**: Q3で依頼者がAを選択した。
- 単体テストと主要な境界の結合テストを用意し、classicの品質目標として行カバレッジ80%以上と統合前のCI実行を確認する。

## Guard Policy

<!-- Affirmed by the team. Mode: strict, relaxed, or off. Strict here holds for every intent, whatever one person asks in chat; relaxed or off here applies to every intent whose policy came from its scope, unless project.md or the person sets another; changing this line changes it. A section under the retired Change Control heading, written by an earlier release, is still read. -->

## Deployment

私たちは検証環境へ統合後に自動反映し、本番への反映には別途人の承認を設ける。環境の数や実際の公開方法は後続の設計で決める。この方針への回答は実際のデプロイ実行の承認を意味しない。

## Code Style

私たちは採用言語の標準的な命名と、プロジェクトに設定する整形・静的解析ツールに従う。CIで検査し、違反がある変更は統合しない。使用ツールは技術選定後に決める。
## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
