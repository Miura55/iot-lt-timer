# 作業担当

入力: [bolt-plan.md](bolt-plan.md)、[unit-of-work.md](../units-generation/unit-of-work.md)、[unit-of-work-dependency.md](../units-generation/unit-of-work-dependency.md)、[team-practices.md](../practices-discovery/team-practices.md)、[回答](delivery-planning-questions.md)。

作業単位（Bolt）は一つのUnitを実装・確認するまとまりである。mobは一緒に成果を作る少人数のチームを指す。このclassic計画では組織チーム編成の段階は実施していないため、各BoltはAI開発担当が直列で進める。依頼者は製品判断を行い、Pico側MQTT受信実装、実機の用意、実ベル試験を担う。

| 順 | Bolt | Unit | 実装担当 | 依頼者の関与 | 依存 |
|---|---|---|---|---|---|
| 1 | u1-integrated-timer | U1 | aidlc-developer-agent | Pico側の契約適合、AWS開発接続の準備、実機試験 | なし |
| 2 | u2-timer-controls | U2 | aidlc-developer-agent | 競合・停止境界の判断が必要な場合の確認 | U1 |
| 3 | u3-mobile-experience | U3 | aidlc-developer-agent | スマートフォンでの操作・アクセシビリティ確認 | U1、U2 |

全体接続を含む最小実装を最初に確認する要望を満たすため、Unit DAGの先頭U1を一つ目にする。U2とU3は依存があるので同時進行しない。統合先は `main`、短期間の変更をsquash-mergeする。検証環境への自動反映方針は実際のパイプラインがある場合に適用し、本番反映は別途承認を必要とする。この計画はデプロイ実行を承認しない。
