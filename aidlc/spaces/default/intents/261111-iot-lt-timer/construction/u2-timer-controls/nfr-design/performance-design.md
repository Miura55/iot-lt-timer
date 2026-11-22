# U2 性能設計

入力: [性能要件](../nfr-requirements/performance-requirements.md)、[信頼性要件](../nfr-requirements/reliability-requirements.md)、[U2機能仕様](../functional-design/functional-spec.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

## 操作要求の応答経路

- HTTP操作は入力・認可確認後、session versionを条件として状態遷移を耐久保存する。外部IoT呼出しをHTTP要求スレッド内で待たない。
- session状態と操作結果は一つのrepository境界で読み書きし、重複する集約取得や別の一覧scanを成功経路に入れない。
- 操作競合が10秒以内に解けない場合はC1どおり409 `IN_PROGRESS`を返す。処理成功と表示するのは状態遷移とreceiptが耐久確定した後のみ。
- p95等の数値SLAは入力で承認されていないため設けない。運用観測値を得た後に目標値を改訂する。

## 予定と通知の回復

resumeは新世代を耐久化し、pending通知wakeを決定的な名前・入力で登録する。登録が遅延しても操作APIをAWS応答待ちにせず、pending登録をreconcilerが再照合する。60秒ごとのscanは上限10通知を扱い、外部送信結果の再試行は5秒expiryを超えない。65秒は回復目標でありSLAではない。

キャッシュは状態の古い表示や操作version競合を増やすため使わない。ブラウザーは状態取得のserverTimeを使い、操作後に状態を再取得して補正する。
