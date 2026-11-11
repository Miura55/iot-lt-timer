# 実装単位の分割計画

入力: ../domain-design/components.md、../domain-design/decisions.md、../requirements-analysis/requirements.md、../user-stories/stories.md。

## 分割案

承認済みの論理部品を機能の縦断単位で段階的に実装する。共有のバックエンドを使う構成とし、部品ごとの独立したマイクロサービス化は行わない。具体的なAWSサービス・言語は後続設計で選ぶ。画面とバックエンドの配信は分けられるが、APIと版の互換を同じリポジトリで管理する。

| ID | Directory | kind | 範囲 | 依存 |
|---|---|---|---|---|
| U1 | u1-integrated-timer | service | 認証、最小のスマホ画面、有効な時間・ベル設定の入力、開始、バックエンド待機、MQTT送信、送信結果取得を通す統合最小構成。模擬受信と実サービス送信を検証できる形にする | なし |
| U2 | u2-timer-controls | service | 一時停止・再開・取消し、古い予定の無効化、競合・重複・期限・結果不明の回復を完成させる。最小画面にも操作を追加し単独で検証する | U1 |
| U3 | u3-mobile-experience | ui | 進行・設定タブ、次回設定1組の保存と再利用、通知一覧、各エラー・部分状態、スマホとアクセシビリティを仕上げる。保存APIの不足分も同じ単位で実装する | U1、U2 |

U1は孤立した部品ではなく、後続のU2/U3がなくても画面→バックエンド→MQTT受信までを確認する。U1/U2に小さい画面変更があってもkindはバックエンドを含む実行可能なserviceとする。U3は主にuiであり、保存APIの追加も含むため実装計画でAPIの設計・試験を省略しない。
これは依存関係の案で、経済的な優先順位や配信の順序はDelivery Planningで扱う。3単位は依存するため並列実装を前提としない。全8シナリオを最終的に満たし、単位間の呼出し・データ・MQTT仕様はContract Designで確定する。

## Plan Approval

A. Approve Plan — 上記3単位とkind・依存関係で分割資料を作成する。
B. Revise Plan — 単位数、範囲、配置方針を修正する。
X. Other (please specify)

[Answer]: Approve Plan

依頼者の原文: この案で問題ないと思います
