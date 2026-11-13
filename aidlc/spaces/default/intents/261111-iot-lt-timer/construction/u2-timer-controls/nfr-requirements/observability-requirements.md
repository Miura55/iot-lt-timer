# U2 可観測性要件

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2業務ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 検証 |
|---|---|---|
| NFR5.2 | 状態変更ログはsessionId、operation idempotency key（機密でない識別子）、route、結果code、開始/確定時刻、version前後、generationを相関可能な形で記録する。 | ログschemaの単体テストと代表的な成功・拒否・競合の結合試験を行う。 |
| NFR5.3 | `IN_PROGRESS`、wake登録失敗、期限切れlease、操作receipt未確定、notification unknownを個別に観測可能とし、reconcilerが検出件数と最終成功/失敗を記録する。 | 障害注入後に期待する構造化ログと集計カウンターが存在することを確認する。 |
| NFR5.4 | 初版は各状態変更、照合、通知試行をrequest/session IDで追跡できる。7日超の履歴は削除する。ダッシュボード・ページング・長期分析は提供しない。 | 保持境界とsecret scrubのテストを行う。 |

アラート閾値と通知先はInfrastructure Designで、運用手順はObservability Setupで決める。Pico ACKや実鳴動成功をログから推測しない。
