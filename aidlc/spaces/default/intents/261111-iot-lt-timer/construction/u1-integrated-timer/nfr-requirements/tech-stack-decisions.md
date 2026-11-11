# U1 技術選択案

入力: [U1機能仕様](../functional-design/functional-spec.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[components.md](../../../inception/domain-design/components.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)、[認証基盤の回答](nfr-requirements-questions.md)。

以下はグリーンフィールドの小規模なAWSアプリとイベント目標に対する**推奨案**である。Concrete AWS構成・待機方式・料金はInfrastructure Designで比較し、承認済み予算の月額目安500円に対してクレジット適用前の試算を別途提示する。ここで費用やサービス可用性を保証しない。

| 領域 | 推奨案 | 理由・代替案 |
|---|---|---|
| Web UI | TypeScript + ReactによるレスポンシブWebアプリ | スマートフォン中心で日本語の状態表示・入力検証を実装しやすくする。静的HTMLを手書きするより状態変化を管理しやすい。特定のUIコンポーネントライブラリは選定しない。 |
| Backend/API | TypeScript/Node.jsの小さなHTTPS API | UIと実装言語を揃え、認証・入力検証・永続状態を一つの保守しやすい実装にする。実行サービス・バージョンはInfrastructure Designで決める。 |
| 時間管理 | AWS Step Functions Standardを第一候補として比較 | 明示的な状態、待機、再試行、実行履歴はブラウザー切断後の時間管理に合う。代替として永続化したdue-timeと軽量スケジューラを比較し、待機回数・遅延・費用が条件に合うか計算する。 |
| 永続データ | DynamoDBを第一候補として比較 | 1会場・少量の状態でmanaged durable storageと条件付き更新を使いやすい。代替として小規模リレーショナルDBを比較し、排他・履歴・費用を評価する。 |
| 認証 | AWS Cognito等のメール招待制マネージド認証を候補とする | 既存認証基盤はないとの回答を反映。一般公開の自己登録を無効化し、許可済み主催者だけを追加する。本人確認の運用と認証発行者はInfrastructure Designで確定する。 |
| ベル通信 | AWS IoT Core MQTT、v1 C3に準拠 | 依頼者実装のPicoと接続し、TLS、QoS 1、retainedなし、期限・commandId重複排除を適用する。 |
| 配信・IaC | TypeScript対応IaCを候補として比較 | dev/prod分離、権限範囲、再現可能な東京リージョン構築を記述する。実行ツールはInfrastructure Designで決める。 |

### U1に適用する共通品質条件

- **NFR6.1** JavaScript/TypeScriptの単体テストと主要境界の結合テストをtest-afterで作成する。
- **NFR6.2** アプリケーションコードの行カバレッジ80%以上を統合条件とする。
- **NFR6.3** CIでテスト・整形・静的解析を統合前に実行する。CIパイプライン段階はこのスコープでは含まれないため、実際のCI構成をどのUnitで設けるかCode Generation計画で明示する。
- 開発時は模擬ベル受信ポートを使い、実AWS用の秘密情報なしでも単体・結合試験を動かす。実AWS接続は利用者が用意した開発認証情報と明示的な試験許可がある場合だけ行う。
- AWSリージョンは東京。S3/CloudFront/API Gateway/Lambdaなどの具体的な組合せはInfrastructure Designまで暫定とする。
