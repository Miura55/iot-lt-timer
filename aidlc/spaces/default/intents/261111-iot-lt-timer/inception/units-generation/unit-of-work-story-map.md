# シナリオと実装単位
入力: [stories.md](../user-stories/stories.md)、[requirements.md](../requirements-analysis/requirements.md)、[components.md](../domain-design/components.md)。[単位定義](unit-of-work.md)と一致させる。
複数単位の行では各単位が関係する全受け入れ条件を読み、自分の担当部分と前段の維持部分を区別して設計・検証する。

| Story | Unit ID | Directory | 担当部分 |
|---|---|---|---|
| US1.1 | U1; U3 | u1-integrated-timer; u3-mobile-experience | U1で認証・認可、U3で画面と再認証時の下書き |
| US1.2 | U1; U3 | u1-integrated-timer; u3-mobile-experience | U1で入力検証と開始用設定、U3で保存・再利用・版競合と完成画面 |
| US1.3 | U1; U2; U3 | u1-integrated-timer; u2-timer-controls; u3-mobile-experience | U1で開始・継続・状態取得、U2で競合回復、U3で古い表示等の完成画面 |
| US1.4 | U2; U3 | u2-timer-controls; u3-mobile-experience | U2で停止と最小画面、U3で完成画面・エラー表示 |
| US1.5 | U2; U3 | u2-timer-controls; u3-mobile-experience | U2で再開と最小画面、U3で完成画面・エラー表示 |
| US1.6 | U2; U3 | u2-timer-controls; u3-mobile-experience | U2で取消しと最小画面、U3で確認・結果の完成画面 |
| US1.7 | U1; U2; U3 | u1-integrated-timer; u2-timer-controls; u3-mobile-experience | U1で送信と結果取得、U2で期限・不明結果の回復、U3で通知一覧と状態表示 |
| US1.8 | U1; U2; U3 | u1-integrated-timer; u2-timer-controls; u3-mobile-experience | U1で模擬と実サービス経路、U2で重複・期限・競合検証、U3で完成後の実機・操作確認手順と統合証拠 |

8件をすべて割り当て、3単位すべてに担当がある。US1.8の実鳴動確認は実機が準備できた時点で行い、未実施を成功扱いしない。模擬試験と実機試験は異なる証拠として保存する。

## 各単位内の実装の流れ
- U1: 認証境界と入力検証、実行状態、待機と送信ポート、最小画面、各層の実装後の試験、統合確認。
- U2: 状態遷移、世代・重複・競合の制御、最小画面の操作、各層の実装後の試験と回復の結合検証。
- U3: 保存APIと各層の試験、タブと画面状態、操作・アクセシビリティ確認、全体の実機検証の記録。
上記は単位内部の説明であり、単位間の配信判断はDelivery Planningで行う。
