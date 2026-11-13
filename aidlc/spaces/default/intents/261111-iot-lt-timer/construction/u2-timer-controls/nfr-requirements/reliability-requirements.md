# U2 信頼性要件

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2業務ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 検証 |
|---|---|---|
| NFR2.6 | pause/resume/cancelのsession遷移と共有OperationReceiptは耐久ストア上で条件付きに更新し、session versionは受理遷移ごとに一度だけ増やす。U1が定義したOperationReceipt形状を拡張して共有し、U2専用の競合するreceipt正本を作らない。 | 並行要求後にsession、receipt、versionを実repository形状で照合する。 |
| NFR2.7 | 通知送信許可claimを獲得済みのまま停止したworkerを期限付きleaseとして検出し、同一notificationId/commandIdで状態照合を再開する。曖昧な外部結果は受理か期限切れまでunknown候補として保持し、明確な拒否で曖昧結果を消さない。 | publish直後停止、lease期限切れ、曖昧応答、確定拒否の障害注入試験を行う。 |
| NFR2.8 | resumeはsession・未送信通知の新generationを耐久化してwakeを登録する。決定的なexecution name/inputで冪等登録し、応答不明なら同じ登録を照合する。FAILED/TIMED_OUT/ABORTED等の終端失敗が確認できた場合だけ条件付きattempt増加を行う。60秒周期の照合がpending/registeredと実際のwakeを比較して欠落を修復する。 | ExecutionAlreadyExists、失敗、応答不明、照合再実行をstubbed Step Functions clientで検証する。 |
| NFR2.9 | `IN_PROGRESS` receiptを作成した操作は、所有workerのlease期限後にreconcilerが永続session stateから確定応答または確定失敗を導出しreceiptを閉じる。元の応答が不明なら新しい操作を実行せず、同じkeyは結果確定まで409のままにする。 | worker停止後のpause/resume/cancel、期限切れlease、同じkey再試行、別key競合をfake clockで検証する。 |
| NFR2.10 | 通知claimとpause/cancelの競合では永続条件付き更新の勝者が操作順を決める。先に送信権限を取った通知は受付確認または5秒expiryで確定させるまで停止・取消しを成功表示しない。 | 操作・claimの順序を交互に固定した統合試験を行い、sent/failed/expired/unknown/cancelledの区分とsession状態を照合する。 |
| NFR2.11 | 通知wake、deadline wake、operation reconcileは重複・古いgeneration・順序逆転に安全で、停止・終端状態や期限切れ後にpublishしない。外部IoT送信の厳密一回保証はしない。 | duplicate wake、stale generation、expiry boundary、reconcile replayの障害注入試験を行う。 |
| NFR5.1 | session/operation/notificationを相関IDで追跡し、保持は7日を提案値として期限後に削除する。ログにsecretや認証情報を保存しない。 | TTL/削除経路と構造化ログを検証する。保持期間の変更は新しい承認が必要。 |

可用性パーセントや災害復旧RTO/RPOは利用規模・運用体制が未確定のため保証値を置かない。バックエンド障害中の自動的な鳴動保証はしない。
