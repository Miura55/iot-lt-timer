# U2 技術選択

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2ルール](../functional-design/rules.md)、[U1技術選択](../../u1-integrated-timer/nfr-requirements/tech-stack-decisions.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

U2はU1の共有バックエンドに機能を追加し、独立したサービスや別データベースを導入しない。技術スタックはU1の推奨を継承し、具体的なマネージドサービス・料金・実行環境はInfrastructure Designで確定する。

| 領域 | U2での選択 | 理由・境界 |
|---|---|---|
| API / domain | U1と同一のTypeScript / Node.js API・domain package | C1操作API、version検証、冪等な状態遷移を共有コードに実装する。 |
| UI | U1のReact/TypeScript最小画面に制御を追加。完成画面はU3 | 少なくともrunning/paused/terminalの状態表示と操作結果が必要。 |
| 永続化 | U1が選ぶDynamoDB候補とrepositoryを共有 | version/generation条件付き更新と操作receiptを同一の状態所有境界に保つ。 |
| 待機 / 回復 | U1のStep Functions Standard候補と照合機構を共有 | resume時にgenerationを更新し、新世代のwake登録を冪等化する。 |
| 認証 | U1の招待制Cognito等の候補を共有 | operate permissionを追加検証し、一般登録なしを維持する。 |
| ベル | AWS IoT Core MQTT C3契約を変更しない | pause/cancelはpublish済み命令を撤回しない。期限とcommandIdの意味は不変。 |
| テスト | U1と同じTypeScript unit/integration runner、fake clock、AWS SDK stub | 実AWS資格情報やPico実機なしで回復・競合を再現する。 |

新規言語・フレームワークの選択は行わない。選定サービスとIAM/CloudWatch構成はInfrastructure Designで確認する。

## 品質条件

| ID | 要件 | 検証 |
|---|---|---|
| NFR6.1 | 各層を実装した後に単体試験を追加し、pause/resume/cancel、idempotency、version競合、wake回復の主要境界結合試験を用意する。 | Unit-scoped commandをBuild and Testで実行する。 |
| NFR6.2 | アプリケーションコード全体の行カバレッジを80%以上とする。 | Build and Testが組み立て後の全test suiteで測定する。U2単体実行だけで全体floorを判定しない。 |
| NFR6.3 | CIはtest、format、static analysis/typecheckを統合前に成功させる。 | CI pipelineの実行結果をBuild and Testで確認する。 |
