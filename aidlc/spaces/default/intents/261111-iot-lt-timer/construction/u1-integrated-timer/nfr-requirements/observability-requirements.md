# U1 運用観測要件

入力: [U1機能仕様](../functional-design/functional-spec.md)、[U1ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 指標・記録 |
|---|---|---|
| NFR5.1 | 操作、session、notification、バックエンド要求には相関可能なIDを付ける。 | requestId、sessionId、notificationId、処理時刻、状態遷移、結果コード。 |
| NFR5.2 | AWS IoTへの送信試行と応答分類を記録する。 | sent/failed/unknown/expired/cancelled件数、送信試行回数、予定から送信までの遅延。送信受付と実鳴動は別で、デバイス稼働・ACKを作らない。 |
| NFR5.3 | 障害調査に必要な運用記録を7日保持後に削除する。 | 保持期間・削除処理の確認と期限後の削除試験。設定データは上書き・削除まで保持する。 |
| NFR5.4 | 秘密情報をログ・メトリクス・エラー本文に出さない。 | トークン、AWS資格情報、Pico証明書、request payload全体は記録禁止。許可済み識別子と安全なエラーコードだけ記録する。 |
| NFR5.5 | タイマー完了を誤認させない。 | pending/dispatching件数、予定通知期限超過、expired/unknown件数、待機登録・照合失敗を追跡する。イベント前に試験記録を作成する。 |

アラートの送信先や画面はインフラ設計で決める。運用記録だけではPicoのオンライン状態や打音実績を推測しない。個人情報を含むログは収集しない。
