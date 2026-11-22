# U2 スケーラビリティ要件

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2業務ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 検証 |
|---|---|---|
| NFR2.4 | 初版の容量範囲は1会場、同時にrunning/pausedのsession 1件、1sessionあたり通知最大10件、認証済み主催者少人数とする。これを超える会場・セッション分割や負荷量は初版の保証対象にしない。 | 同一会場の同時開始/状態変更を複数クライアントから送り、単一active sessionと直列化を検証する。 |
| NFR2.5 | 状態照合・期限回復処理はnotification数に比例する10件以内のpending通知と操作receiptを、1session単位で再処理できる。新しい待機起床やretryが全通知の複製を作らない。 | 最大10通知と複数wake重複の統合試験で、実行記録・状態行数・外部送信回数を検証する。 |

水平方向の多会場対応や高スループットは対象外。実利用量を超える性能主張を行わない。
