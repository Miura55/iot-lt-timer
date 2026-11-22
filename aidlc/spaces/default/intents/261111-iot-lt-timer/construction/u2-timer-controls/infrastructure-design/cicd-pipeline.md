# U2 CI/CDパイプライン

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2信頼性設計](../nfr-design/reliability-design.md)、[U2論理コンポーネント](../nfr-design/logical-components.md)、[U1インフラ構成](../../u1-integrated-timer/infrastructure-design/infrastructure-specification.md)、[チーム運用方針](../../../../../memory/team.md)。

既存GitHub Actionsを拡張し、U2コードとCDK変更を同じ変更単位で検査する。CIはAWS資格情報を取得せず、IaCのsynth/assertionまでを行う。環境deployはPR merge後に分離されたOIDC roleを使う。

## Pipeline stages and gates

| Stage | Trigger | Gate / evidence |
|---|---|---|
| Checkout / dependency install | pull request, main push | lockfile準拠の再現可能なinstall。秘密情報を使わない |
| Format / lint / static analysis | pull request, main push | formatter checkとlintに違反がない |
| Typecheck / build | pull request, main push | web、API、domain、infraの型検査/build成功 |
| Unit and integration tests | pull request, main push | pause/resume/cancel、idempotency、version競合、lease回復、wake登録曖昧応答、dispatcher境界の試験成功 |
| Coverage | pull request, main push | アプリケーションコードの全体行カバレッジ80%以上。U2単体だけで全体floorを評価しない |
| CDK synth / assertions | pull request, main push | U2 route、DynamoDB table、Lambda grants、state machine、scheduler/alarmsの構成が合成可能で最小権限である |
| Deploy dev | main push | GitHub Actions OIDCでdev用roleを引受け、CDK diff確認後devへ反映 |
| Cloud smoke / contract check | dev deploy success | HTTPS/API、認証、状態操作、模擬IoT publisherまで検証。Pico実鳴動を模擬合格としない |
| Deploy prod | 手動承認付きworkflow | prod環境保護と承認後に限りCDK反映 |
| Post-deploy smoke | prod deploy success | ログイン、読み取り、pause/resume/cancel、監視を確認。失敗時は手順に従い前revisionへ戻す |

## Pull requests and release strategy

チーム方針の`main`統合・短期作業ブランチ・squash mergeに従い、Unitごとに独立したPRとCI結果を対応付ける。U1が共有CDK資源のownerであるため、U2 PRにはU1の共有repository/CDKに対する必要最小の拡張だけを含める。レビュー中のPRブランチをU2 PRのbaseとする場合は、U1がmainへ統合された時点でU2のbaseをmainへ付け替える。

CDK CloudFormation更新はAWSの標準stack rollbackを有効にし、DynamoDBの既存状態を削除・置換する変更を含めない。アプリのrollbackは直前の承認済みcommitへ再deployする。schema変更は新旧reader互換を保ってから段階的に削除し、timer/notification stateを破壊的に戻さない。

## Secrets and deployment identities

PR checksはrepository secretsやAWS credentialを参照しない。dev/prod GitHub Actions roleはOIDCで引受け、repository、branch、GitHub environmentをtrust policyで限定する。roleは対象CDK stackのdeployと必要なasset publishだけを許可し、長期AWS keyをGitHubへ保存しない。Cognito client secret、IoT device private key、tokenはworkflow log/artifactへ出さない。Pico用private keyの配布・rotationはデバイス準備と運用手順の責任範囲に残す。

## Operations and rollback

prod deployはイベント直前の無監視時間帯に実施しない。deploy後にAPI 5xx、wake registration、pending operation lease、notification unknownを監視する。異常時はLambda/stackを前revisionへ戻し、永続sessionを手動削除せず、運用者が画面/APIで最新stateを照合してから同一idempotency keyの再照会を行う。AWS環境・GitHub environment・運用通知先が利用可能になるまで実deployは実行しない。
