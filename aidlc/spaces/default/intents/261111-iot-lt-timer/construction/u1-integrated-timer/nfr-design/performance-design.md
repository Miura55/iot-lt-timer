# U1 性能設計

入力: [性能要件](../nfr-requirements/performance-requirements.md)、[機能仕様](../functional-design/functional-spec.md)、[C1/C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。

## 設計

- セッション開始時に1〜10件の通知を耐久ストアへ一括またはトランザクションで保存し、各予定時刻には非同期の期限起動を使う。ブラウザーの時計・タブはスケジューラにしない。
- 起床処理は短時間のハンドラーとして、予定時刻・期限・generationを再読込してからIoT Coreへpublishする。同期APIはこの処理完了を待たない。
- AWS IoT接続はバックエンドの管理されたクライアントで再利用する。送信本文は許可済み項目のみで、負荷試験の対象上限は1会場・同時1セッション・最大10通知。
- 状態取得は契約どおり約2秒間隔、非表示タブでは停止し、復帰時に即時再取得する。応答にはserverTimeとversionを含め、画面は古いversionを捨てる。
- 予定通知は最低2秒間隔で検証する。最初の打音が予定から2秒以内というNFR1.1はイベント前30回の実機測定目標であり、AWSやネットワークから保証される遅延予算ではない。

## 遅延予算と制約

APIの10秒はクライアントの待機上限であって、APIのSLOではない。通知起床からAWS受付までの内部目標は計測するが、NFR1.1の実機30回試験前に数値保証としない。AWS IoT受付とPicoの受信・物理打音を別の事象として記録する。

## 品質検証の設計

- test-afterで各層実装後に単体試験を書き、主要境界（APIと永続ストア、待機起床とDispatcher、Dispatcherと模擬IoT受信）の結合試験を用意する。AWS実資格情報・実IoT Coreなしでも再現できるadapter境界を設ける。
- 行カバレッジ80%はWeb UI・API・ドメイン・IoT adapterのアプリケーションTypeScript/JavaScriptを対象にCIで測定する。生成物とIaC定義は対象外とし、CI設定に除外範囲を明記する。
- CIはformat/lint、型検査、unit、主要結合、coverageを順に実行する。いずれかの失敗またはcoverage 80%未満ならmainへの統合を拒否する。Infrastructure DesignでGitHub ActionsとOIDCの具体構成を定める。

## 回復時間の合意

Functional Designの正本と一致させる。通知0件は正常なdeadline起床でdeadline時に完了し、起床消失時はdeadline+65秒を回復目標とする。通知ありはdeadline経過かつ全通知終端後に完了し、起床消失時の目標はmax(deadline, 最新notification.expiresAt+65秒)。終了時通知ではexpiresAt=deadline+5秒のため、最悪の回復目標はdeadline+70秒となる。5秒は命令送信期限であり、回復遅延時に送信期限を延長しない。
