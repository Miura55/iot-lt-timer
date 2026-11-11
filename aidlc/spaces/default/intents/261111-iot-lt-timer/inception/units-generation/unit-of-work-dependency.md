# 実装単位の依存関係
入力: [components.md](../domain-design/components.md)、[decisions.md](../domain-design/decisions.md)、[requirements.md](../requirements-analysis/requirements.md)、[stories.md](../user-stories/stories.md)。
配置と範囲は[unit-of-work.md](unit-of-work.md)を参照する。依存はコード・試験に必要な関係で、経済的な優先順位や配信順の推薦ではない。

```yaml
units:
  - name: u1-integrated-timer
    kind: service
    depends_on: []
  - name: u2-timer-controls
    kind: service
    depends_on: [u1-integrated-timer]
  - name: u3-mobile-experience
    kind: ui
    depends_on: [u1-integrated-timer, u2-timer-controls]
```

U2はU1の実行状態・送信境界と最小画面を必要とする。U3はU1の認証・開始・状態取得と、U2の停止・再開・取消しのコードおよび試験用契約を必要とする。自己依存・循環・未宣言参照はない。
独立な並列実装可能集合は各単位単独のみ。U2/U3の独立した同時実装を前提としない。
最初の依存なしの単位U1は画面→バックエンド時間管理→MQTT受信の統合最小構成であり、U2/U3を待たずに動作する。実AWSの準備とPico実機の準備は単位DAGの隠れたコード依存ではなく、検証環境の外部条件として記録する。

## 接点
- U1/U2: 同じTimerControlの状態遷移・通知世代・送信結果。APIと内部の型はContract Designで定義する。
- U1/U3: 認証、次回設定の保存・取得、開始時の写し、現在状態と通知の表示。保存設定の所有はSettingsManagementに限定する。
- U2/U3: 停止・再開・取消しのAPI、競合・結果不明の表示、受理後の状態。画面側で状態を勝手に確定しない。
- 外部: BellTransportからAWS IoT Core経由でPicoへ通知。模擬受信・実機確認手順とMQTT契約を用意する。
