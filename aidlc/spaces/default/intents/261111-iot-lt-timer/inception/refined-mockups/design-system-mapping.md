# デザインの対応表
入力: [requirements.md](../requirements-analysis/requirements.md)、[stories.md](../user-stories/stories.md)、[team-practices.md](../practices-discovery/team-practices.md)。
既存のロゴ・コンポーネント指定はなく、質問回答に基づく明るいスマホ向けの独自トークンを提案する。特定UIライブラリの採用はこの段階では確定しない。

| トークン | 値と用途 |
|---|---|
| 背景 / パネル | #F8FAFC / #FFFFFF |
| 本文 / 補助 | #0F172A / #475569 |
| 主要操作 / hover | #1D4ED8 / #1E40AF、白文字 |
| エラー | #B91C1C、文章・アイコンを併用 |
| 成功 | #166534、文章を併用 |
| 操作境界 | #64748B、背景と区別できる境界 |
| focus | #1D4ED8、白い隙間2pxと外枠2px |
| 間隔 | 4 / 8 / 16 / 24 / 32px |
| 角丸 | 入力8px、パネル12px |
| 文字 | システム日本語フォント、本文16px、補助14px、時間56〜80px |
| モーション | 150ms以下、reduced-motionで無効。数字の点滅なし |

ネイティブbutton/input/select/dialogを優先する。タブとフォーカス管理だけ必要なARIAを加える。コンポーネントの状態・入力・例は[interaction-spec.md](interaction-spec.md)。

## レスポンシブ
320〜767pxは左右16px、1列、操作全幅。768px以上は最大720pxで中央に置き、タブ分離は維持する。200%・400%拡大でも内容を折り返し、重要操作を隠さない。表示上の「分・秒」とAPIの秒数は変換箇所を統一する。
