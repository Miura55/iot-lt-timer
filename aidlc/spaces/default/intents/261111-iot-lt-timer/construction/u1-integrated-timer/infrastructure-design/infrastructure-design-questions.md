# インフラ設計の確認

入力: U1の機能仕様、NFR設計、AWSリージョン・予算・利用開始時期の決定。

## Q1. [運用] 主催者ログイン

既存の認証基盤はないため、利用できる主催者を限定する方式を決める。一般登録は行わない。

A. Amazon Cognito User Poolを使い、管理者が主催者を招待する（推奨）。
B. まずローカル開発用の模擬ログインを用意し、AWS認証は後で追加する。
C. 既存の認証サービスを使う（サービス名を記入）。
X. Other (please specify)

[Answer]: A. Amazon Cognito User Poolの招待制を使う。

## Q2. [開発] AWSリソースの管理方法

AWS構成をコードで再現できるようにし、アプリと一緒に変更履歴を管理する。

A. AWS CDK（TypeScript）で管理する（推奨）。
B. AWS SAMで管理する。
C. AWSコンソールで手動作成する。
X. Other (please specify)

[Answer]: A. AWS CDK（TypeScript）で管理する。

## Consolidated Summary Confirmation

- リージョンは東京（ap-northeast-1）、月額500円を目安とする。予算超過時の自動停止は要件にしない。
- 認証は管理者招待制のAmazon Cognito User Poolとし、一般登録を無効にする。
- AWS CDK（TypeScript）でインフラを定義する。
- スマートフォン向けWeb画面はCloudFront経由で配信し、APIはAPI Gateway + Lambda、状態はDynamoDBに永続化する。
- タイマーと通知の起床はStep Functions Standard、60秒ごとの独立照合はEventBridge Schedulerから実行し、ベル命令はAWS IoT Core MQTTへ送る。
- 本番向けのカスタムドメインは未指定のため、初期配備ではCloudFrontの既定ドメインを使う。
- CI/CDはGitHub ActionsのOIDC連携を前提とする。AWSアカウント・GitHub接続が利用できるかは配備時に確認する。

[Answer]: Looks correct

A. Looks correct
B. Request changes
