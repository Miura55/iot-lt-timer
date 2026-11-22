# U2 インフラ設計の前提確認

既決事項を再確認し、U2に固有の追加選択が必要か確認した。初版のリージョン、費用上限の目安、AWS構成、認証、画面配信はU1で決定済み。U2は同じ会場タイマー基盤へ制御APIと回復処理を追加するため、新しい実行環境・DB・ネットワーク構成を増やさない。

| 項目 | 設計へ引き継ぐ決定 | 根拠 |
|---|---|---|
| リージョンと予算 | 東京 `ap-northeast-1`、月額500円を目安とする通知。クレジット適用前の利用料を計測し、予算超過時に自動停止しない。 | 利用者回答、U1インフラ構成 |
| 配置 | S3 + CloudFront、API Gateway HTTP API + Lambda、DynamoDB、Step Functions Standard、毎分EventBridge Scheduler照合。 | U1インフラ構成、U2 NFR設計 |
| 認証・IoT | 招待制Cognito JWTとサーバー側venue grant。C3のIoT Core topic/QoS/retain契約を維持。 | C1/C3、U1インフラ構成 |
| CI/CD | GitHub ActionsでPR検査、main統合後dev反映、本番は人の承認を通す。実行環境の認証はOIDC。 | チーム運用方針、U1インフラ構成 |
| 追加AWS資源 | 新規サービスは追加せず、U1共有資源にpause/resume/cancel API、pendingOperation回復、運用メトリクスを追加する。 | U2論理構成・信頼性設計 |

未決の運用連絡先やAWSアカウント認証情報はインフラ設計で推測せず、配備時の設定事項として残す。
