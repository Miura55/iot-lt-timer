# U1 CI/CDパイプライン

入力: [U1性能・品質設計](../nfr-design/performance-design.md)、[U1セキュリティ設計](../nfr-design/security-design.md)、[AWS構成](infrastructure-specification.md)、[U1連携仕様](../../../inception/contract-design/contract-summary.md)。

## Pipeline

1. Pull requestでNode.js/TypeScript依存をlockfileから導入し、format check、lint、型検査を実行する。
2. アプリケーションのunit testと主要境界integration testを実行する。AWS IoT/Coreや資格情報を必要とせず、fake clock、DynamoDB Localまたはrepository mock、IoT adapter mockを使う。
3. アプリケーションTS/JSのline coverageを測定する。`apps/**`、`packages/**`などの実ソースを対象とし、生成コードと`infra/**`は明示的に除外する。80%未満、またはcheck失敗はmergeを拒否する。
4. CDK synthとCDK assertionsを実行し、生成template・IAM権限・CloudFront bucket access・IoT topic restrictionを確認する。Secretsや環境固有値をartifactへ含めない。
5. main merge後、GitHub Actions OIDCでAWSへ認証し、dev stackへCDK deployする。合成差分とデプロイ結果を保存し、API health/smoke確認を行う。
6. 実機・AWS IoT接続の統合確認後、運用者がproduction deploy jobを手動承認する。初版は1つのprod stackへCDK deployし、破壊的なDynamoDB変更は別途移行手順なしに自動適用しない。
7. Deploy後にAPI health、Cognito login、state取得、mock/実機 bell command の運用チェックを行う。失敗した場合は直前のアプリartifactを再デプロイし、インフラ変更はCDK差分の安全性を確認してから戻す。

## Stage-to-gate mapping

| Stage | Gate |
|---|---|
| Format/lint/typecheck/unit/integration/coverage | すべてgreen、coverage >= 80%。失敗時merge不可。 |
| CDK synth/assertions | template生成、権限制限、環境設定、意図しない置換がないこと。 |
| PR merge | required checks通過とreview。 |
| Dev deployment | OIDC roleは対象GitHub repositoryとmain branchに限定。CDK diff確認後、自動deploy。 |
| Production deployment | 対象環境の明示的なGitHub Environment approval後にdeploy。実機30通知の測定結果・運用連絡先・Budget設定を確認。 |
| Post-deploy smoke | API / login /状態表示に成功。IoT受付を実打音と誤認しない。失敗時はアプリartifactをrollback。 |

## AWS credentials and rollback

GitHub ActionsはAWS IAM OIDC providerを使い、access keyをrepository secretsへ保存しない。Role trust policyはGitHub organization/repository、`main` branchまたは保護されたproduction environmentのsubject条件を限定する。Role policyは対象のCDK stackと必要なCloudFormation deploy権限に制限し、ワイルドカードの恒久付与を避ける。

Devはmain mergeごとに更新し、productionは手動承認後に反映する。アプリの異常時は前のimmutable build artifactへ戻す。DynamoDB schema/データ変更やStep Functions state互換性を壊す変更はrollbackだけで戻せないため、expand/contract方式の移行を先に行う。Pico firmwareの互換性が必要なC3変更はアプリ・デバイスの双方が更新可能になるまで後方互換にする。

## Secrets and environments

CIにはAWS access key、Cognito user password、Pico private keyを保存しない。Cognito招待は管理操作で行う。GitHub OIDC設定、AWS account/role、GitHub repository識別子、prod approver、Budget通知メールは最初の配備前に管理者が設定する必要がある。dev/prodでAPI URL、User Pool、DynamoDB、IoT topicを分離し、dev命令が実ベルtopicへ届かないことをCDK assertionと接続試験で確認する。
