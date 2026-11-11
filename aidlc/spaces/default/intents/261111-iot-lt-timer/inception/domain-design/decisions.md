# 構成の設計判断
入力: requirements.md、stories.md、team-practices.md（いずれもinception配下の前段階）、domain-design-questions.md。具体的な部品一覧は[components.md](components.md)。配置・スタック・料金の判断は後続段階で行う。

## ADR-001: 実行と通知の状態を同じ所有者にまとめる
- **Status**: Proposed
- **Context**: FR5・FR7〜FR14は停止・取消しと通知送信の競合を扱う。1会場・同時1件で、別所有者の通知が古い状態から鳴らすことを防ぐ必要がある。
- **Decision**: TimerControlがTimerSessionとScheduledNotificationを所有し、送信可否を判断する。BellTransportは外部通信の変換だけを担う。
- **Consequences**: 整合性の判断が一箇所になる。部品は大きくなるが内部で分割可能。サービス受付と永続化の原子性は保証できず、結果不明と回復処理が必要。
- **Alternatives Rejected**: 独立通知部品は状態無効化の調停を増やす。ブラウザー管理は閉じた後の実行継続と信頼境界を満たさない。
- **Security and compliance**: 外部送信の資格情報を画面へ渡さない。認可と内部起床の検証が必要。個人情報は主催者識別の必要最小限とする。

## ADR-002: 次回保存設定と実行スナップショットを分ける
- **Status**: Proposed
- **Context**: Q1で次回設定1組の上書き保存が選ばれ、FR13は実行中の編集を次回から適用する。
- **Decision**: SettingsManagementが保存設定を所有し、TimerControlは開始時の版と値の写しを所有する。新規開始は最新保存済み設定を使う。
- **Consequences**: 編集による予期しない実行変更を防ぐ。設定版と実行時の写しが必要で、画面ではどちらを表示しているか説明する。
- **Alternatives Rejected**: 実行から保存設定を常に直接参照すると途中変更が反映される。実行中の設定編集を全面禁止すると次回準備の利便性を落とす。
- **Security and compliance**: 会場の権限検査を設定の読取・書込にも適用し、スナップショットへ資格情報を含めない。

