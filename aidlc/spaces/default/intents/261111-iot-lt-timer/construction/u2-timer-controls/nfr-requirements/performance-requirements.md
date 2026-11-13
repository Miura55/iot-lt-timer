# U2 性能要件

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2業務ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 検証 |
|---|---|---|
| NFR2.1 | 状態変更APIはクライアント最大待機10秒以内に確定応答を返す。処理が10秒を超えて未確定なら同じIdempotency-Keyに対する409 `IN_PROGRESS`と`Retry-After: 1`を返し、成功や未実行を推測させない。 | API結合試験で正常・遅延・タイムアウト後の同一キー再試行を測定する。 |
| NFR2.2 | 各状態変更の耐久記録から画面へ返すserverTimeとsession versionが一貫し、競合操作で成功した1件以外は10秒以内に409で確定する。p95の数値SLAは未承認のため設定しない。 | 同時pause/cancel/dispatch競合を模擬し、受理件数・版・返却stateを照合する。 |
| NFR2.3 | resume後のpending通知wake登録は再開受理の耐久化と同じ操作結果へ結び付け、登録応答不明・実行消失を検出したものは60秒ごとの照合で回復する。起床処理の回復目標は対象時刻から65秒以内であり、ハードリアルタイム保証ではない。 | 時計を制御した統合試験で登録失敗・応答不明・再照合を検証する。 |
| NFR4.1 | Pause/Resume/Cancelの最小画面操作は幅320 CSS pxで主要ボタン・state・残り時間・エラーが欠落せず表示される。 | 320 CSS px相当のビューポートでレイアウト検査する。完成画面の追加要件はU3が検証する。 |
| NFR4.2 | 状態変更ボタンとエラーはキーボードで操作でき、名称・状態を読み上げ可能とし、色だけで区別しない。 | アクセシビリティの自動検査とキーボード操作試験を実施する。 |

NFR1の実機打音2秒目標はU3の実機検証で扱う。送信受付時間を物理動作時間と同一視しない。
