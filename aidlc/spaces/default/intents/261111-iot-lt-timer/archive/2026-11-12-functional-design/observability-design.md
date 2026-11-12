# U1 観測性設計

入力: [観測要件](../nfr-requirements/observability-requirements.md)、[信頼性要件](../nfr-requirements/reliability-requirements.md)、[C1/C2/C3連携仕様](../../../inception/contract-design/contract-summary.md)。

## 相関ログ・メトリクス

構造化ログにrequestId、sessionId、notificationId、attempt番号、generation、イベント名、UTC時刻、前後状態、結果コード、所要時間を付ける。IoT publish受付結果とdevice ACK/物理動作は別の指標にし、ACK未実装のv1で後者を生成しない。payload、token、証明書、資格情報を記録しない。

最低限、API成功/失敗・応答時間、予定起床遅延、待機登録失敗、due通知数、dispatching lease年齢、期限超過、sent/failed/unknown/expired/cancelled件数、publish再試行数、session完了待ち時間、照合走査件数・失敗を集計する。運用ログは7日で削除する。

## アラートと運用画面

認証/認可・データストア・IoT接続・待機登録・照合の失敗はエラーコードと相関IDで追跡する。pending/dispatching通知が期限を超えた場合、sessionが完了条件待ちで残る場合、unknown/expiredが発生した場合をイベント前の運用確認対象にする。具体的な閾値、通知先、CloudWatch等の選定はInfrastructure Designで決める。アラートがないことはベル稼働・鳴動成功の根拠にしない。

ブラウザー状態画面は最終取得時刻と更新失敗を示し、pending/dispatching/unknown/expired等の契約上の状態を成功と誤認させない。dispatchingの公開表示写像はFunctional Designで未確定のため、設計・実装前に確定する。
