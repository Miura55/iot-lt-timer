# U1 コード生成計画

## Summary

- Builds: スマホ対応のLTタイマー、AWSバックエンド、IoTベル送信
- Touches: `apps/web/`、`apps/api/`、`packages/domain/`、`infra/`、CI設定
- Tests: 約40件の単体・境界結合テストとCDK構成テスト

## Testing Contract

```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "team",
  "ordering": "各テスト可能な層を実装してから、その層のテストを書いて実行する。",
  "scope": "classic",
  "test_strategy": "standard",
  "project_type": "greenfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: test-after\n- **Ordering**: 各テスト可能な層を実装してから、その層のテストを書いて実行する。\n- **Methodology evidence**: Q3で依頼者がAを選択した。\n- 単体テストと主要な境界の結合テストを用意し、classicの品質目標として行カバレッジ80%以上と統合前のCI実行を確認する。"
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Keep the existing test suite green.",
      "This scope adds no extra new-test floor beyond the selected test strategy."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:8b92629c486d6debbc01bc18c29350351c33b307d307b621759f450d77ef5464",
  "contract_sha256": "sha256:5ece9e4136bf1cc347adc3c97cf06c7d8c65986d6afb7852200c3663fc35aeb0"
}
```

## 実装ステップ

- [x] **Step 1 — U1プロジェクト構成と実行設定**（US1.1–US1.3、US1.7、US1.8）: npm workspacesで`apps/web`（React + Vite）、`apps/api`（Node.js + TypeScript Lambda）、`packages/domain`（共有ドメイン）、`infra`（AWS CDK v2）を構成する。環境変数のschema、dev/prod分離、format/lint/typecheckを設定する。既存の`.gitignore`と`AGENTS.md`は変更しない。
- [ ] **Step 2 — テストランナー準備**: Vitest、Testing Library、AWS SDK client mocks、CDK assertionsを導入し、`vitest.config.ts`でapp TS/JS行カバレッジ80%を設定する（IaC除外）。このU1のテスト配置を作り、以下のコマンドがテスト未作成でも実行できることを確認する: `npm exec vitest -- run --passWithNoTests tests/unit/u1`。
- [x] **Step 3 — データモデルと永続化実装**（US1.2、US1.3、US1.7）: TimerSession、ScheduledNotification、IdempotencyRecord、VenueGrantとDynamoDB key/schema、UTC deadline、条件付き更新・トランザクションを実装する。
- [x] **Step 4 — データモデル単体テスト**: 5–8件。入力境界、0〜10通知、1/2/3回、重複時刻拒否、期限端点、generation/wake登録状態を検証する。
- [x] **Step 5 — Repository実装**（US1.3、US1.7、US1.8）: session・通知・冪等性・会場権限のDynamoDB repositoryを実装し、条件付き開始、active session一意性、通知claim、確定応答の保存を行う。
- [ ] **Step 6 — Repositoryテスト**: 5–8件。DynamoDB LocalまたはAWS SDK mockで条件競合、二重開始、冪等再試行、異なる本文のキー再利用、ページング、エラー処理を検証する。
- [x] **Step 7 — ドメインサービス実装**（US1.2、US1.3、US1.7）: 時間・通知の検証、UTC deadlineと予定時刻計算、期限内送信判定、状態投影、pending/dispatching表示、通知結果分類を実装する。
- [x] **Step 8 — ドメイン単体テスト**: 5–8件。境界値、終了時通知、deadline+65秒/通知期限+65秒の回復判定、送信期限5秒、unknown/failed/expired終端判定と公開状態を検証する。
- [x] **Step 9 — バックエンドAPI実装**（US1.1–US1.3、US1.7）: API Gateway HTTP API + LambdaでCognito JWT認証、principal→venue grant認可、`GET /v1/state`と`POST /v1/sessions`、入力検証、Idempotency-Key、requestId付き安全なエラーを実装する。
- [ ] **Step 10 — API/認証境界テスト**: 5–8件。未認証/権限外拒否、開始成功、二重開始、無効入力、同一キー再試行/競合、状態取得、ストア障害をAPI境界で検証する。
- [x] **Step 11 — バックエンド起床・IoT実装**（US1.3、US1.7、US1.8）: Step Functions Standardのdeadline/通知Wait、DynamoDBに保存する決定的なwake登録キー・attempt・状態、曖昧な開始応答の照合、毎分照合Lambda、条件付きlease、AWS IoT QoS 1/retain=false adapterを実装する。デバイス接続を使わないmock adapterも用意する。
- [x] **Step 12 — 起床/IoT境界結合テスト**: 5–8件。早着・重複・旧generation起床、登録曖昧結果の同一キー再試行、terminal failure後のattempt更新、条件付きclaim、期限切れ未送信、安定commandId/payloadを模擬し、実機試験と混同しない。
- [x] **Step 13 — スマホ向けWeb画面実装**（US1.1–US1.3、US1.7）: 320px幅を基準とする明るい画面、認証導線、時間・複数通知・1/2/3回入力、開始確認、残り時間、約2秒ポーリング、更新失敗/最終更新、通知送信状態を実装する。ボタン等に`data-testid`を付け、pause/resume/cancel・次回保存設定はU2/U3へ残す。
- [ ] **Step 14 — Web UIテスト**: 5–8件。入力エラー、通知追加/削除、開始、状態復元、カウントダウン補正、通信失敗表示、送信受付と実鳴動を混同しない文言を検証する。
- [x] **Step 15 — AWS CDKと環境設定**（US1.1、US1.7、US1.8）: Cognito招待制User Pool、HTTP API/JWT authorizer、Lambda、DynamoDB、Step Functions、EventBridge Scheduler、IoT権限、S3/CloudFront OAC、CloudWatch 7日保持・alarm・Budget、OIDC GitHub Actionsをdev/prod分離で定義する。Lambda IAMはテーブル/topic単位に絞る。
- [ ] **Step 16 — CDK構成テスト**: 5–8件のassertionで自己登録無効、JWT保護、OAC限定、暗号化、IoT topic限定、環境分離、ログ保持、OIDC制限を確認する。
- [x] **Step 17 — CI・ローカル統合設定と文書**（US1.8）: PRでformat/lint/typecheck/unit/integration/CDK assertions/coverageを実行し、80%未満で失敗させる。mockと実AWS経路の切替、環境変数、Cognito招待・AWS配備前の必要設定、実機30通知確認手順を`README.md`ではなく`code-summary.md`に記録し、C1/C2/C3の追跡表とsource manifestを作成する。

## ストーリー追跡

| Story | Plan steps |
|---|---|
| US1.1 認証・認可 | 1, 9, 10, 13, 15 |
| US1.2 時間・ベル設定と検証 | 1, 3–4, 7–8, 9–10, 13–14 |
| US1.3 開始・バックエンド時間管理・状態 | 1, 3–10, 11–14 |
| US1.7 ベル命令と結果表示 | 3–14 |
| US1.8 模擬/実AWS接続検証 | 1, 5–6, 11–12, 15–17 |

Pause/resume/cancel（US1.4–US1.6）と設定保存（US1.2/US1.13の保存部分）はU2/U3の担当であり、このU1の成果として画面上で成功表示しない。実機確認・AWS配備は環境情報と別途準備が整うまで行わない。
