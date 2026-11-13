# U2 コード生成サマリー

## Files created/modified

- Domain/API: `packages/domain/src/controls.ts`, `packages/domain/src/{index,types}.ts`、`apps/api/src/timer/{service,repository,dynamo-repository,wake-registrar,reconciler,dispatcher,http-handler,observability}.ts`。
- UI: `apps/web/src/timer-app.tsx` と `apps/web/src/style.css` にpause/resume/cancelと状態結果を追加し、`apps/web/src/control-request.ts`で不確定操作のidempotency keyとbodyを再利用。
- Infrastructure/CI: `infra/src/timer-stack.ts`、`.github/workflows/ci.yml`、root `package.json`、`vitest.config.ts`。
- Tests: `tests/unit/u2/`の8ファイルと`tests/integration/u2/timer-controls.test.ts`を追加。
- ルート`.gitignore`でroot/workspaceごとの`node_modules/`と`cdk.out/`を除外する。ビルド生成された`dist/`は作業ツリーに残るが、U2 source manifestとソース専用PRには含めない。

## Key implementation decisions

- U1の`OperationReceipt`形状を共有し、未完了操作のlease/recovery metadataをsessionへ保存する。pause/resume/cancelはversion条件付きで一度だけ状態遷移し、同じidempotency keyへ確定応答を返す。
- Resumeは新generation・deadline・pending通知を保存してからdeterministic wakeを登録する。既存1分reconcilerがmissing wakeとexpired operationをRecoveryIndexから限定queryで修復する。
- HTTP APIは認証済principalのvenue-scoped `operate`を確認し、古いversion・重複要求・結果不明を成功と表示しない。UIは320 CSS px、keyboard操作、アクセシブルな名前/状態を扱う。
- U1のDynamoDB table/state machine/scheduler/IoT topicを共有し、CloudWatch dashboard/alarmsと構造化operation logsを追加した。
- CIはPRでU1/U2 unit tests、coverage、format/lint/typecheck/build、CDK synthを実行する。AWS credentialsはPR検査へ渡さない。
- `409 IN_PROGRESS`の制御応答はC1の`code/message/requestId`を含むerror envelopeを使い、`Retry-After: 1`を維持する。

## API/UI usage

制御APIは`POST /v1/sessions/{id}/pause`、`/resume`、`/cancel`を使う。各要求はC1 Bearer認証、`Idempotency-Key` UUID、`expectedVersion`が必要。API応答は物理鳴動成功と見なさず、確定応答と最新Stateを画面に反映する。競合は409、未確定同一操作は409 `IN_PROGRESS`と`Retry-After: 1`。通信失敗時は成功と推測せずGET stateで再取得し、再試行には同じidempotency keyを使う。状態遷移とエラー表示の詳細は[U2機能仕様](../functional-design/functional-spec.md)、公開schemaは[C1契約](../../../inception/contract-design/contract-summary.md)を参照する。

## Verification

- `npm run test:u2`: 58 passed（U2再試行/IN_PROGRESSとreview findingの統合ケースを追加後に再確認）。
- `npm run test:u1`: 31 passed。
- `npm run typecheck`: passed after the final request-ID logging change.
- `npm run build`: passed after the final request-ID logging and review-finding fixes; subsequent changes only expanded integration test cases.
- U2 test set: domain 8, repository 7, service 6, HTTP 6, UI 6, control-request retry 5, observability 9, integration 6, CDK assertions 5.

## Tests not executed

- Full-suite line coverage was not measured after U2; Build and Test must verify the project's 80% application line-coverage floor.
- AWS deployment/live Cognito, Step Functions, DynamoDB, and IoT Core verification was not performed because this stage does not deploy resources.
- Pico physical bell tests AC1.8.2–AC1.8.4 remain deferred until the user-owned hardware is available; MQTT/service acceptance is not physical actuation evidence.

## Deviations

- U2 recovery reuses the existing sparse `RecoveryIndex` rather than adding a new GSI or scanning the entire table.
- Browser UI tests initially resolved duplicate React copies because `apps/web/node_modules` exists locally; the Vitest root aliases now force one React runtime. The local dependency directories are excluded by `.gitignore` and absent from the source manifest.
- Code-generation review findings R-01 to R-03 were resolved: complete C1 error envelope for `IN_PROGRESS`, same-key/same-body retries after timeout/503/IN_PROGRESS, and responsive CSS plus actual keyboard interaction assertions at a 320px target.
