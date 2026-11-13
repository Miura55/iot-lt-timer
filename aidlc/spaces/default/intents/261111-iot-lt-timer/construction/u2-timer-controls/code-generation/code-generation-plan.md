## Summary

- Builds: 一時停止・再開・取消しと競合回復
- Touches: apps/api, packages/domain, apps/web, infra/src, tests/unit/u2, tests/integration/u2
- Tests: 約30–45件の単体試験と、主要境界の結合試験

## Scope and story traceability

U2はUS1.3の状態整合・競合回復、US1.4の一時停止、US1.5の再開、US1.6の取消し、US1.7の期限・不明結果回復、US1.8の重複/期限/競合検証を実装する。U1のC1/C2/C3契約とTimerControlの永続状態ownerを維持し、U3が所有する完成画面・設定保存は実装しない。Pico firmware、AWS実環境へのdeploy、実機鳴動確認は対象外。

NFR設計レビューの指摘を実装時に解消する: U1 OperationReceipt形状との一致、pending operation lease回復、resume後deadline wakeの登録/照合、セキュリティ要件ごとの正しい実装trace、320 CSS px / keyboard / accessible name/stateの画面試験を実装またはテストで確認する。DynamoDBのexpired leaseとmissing wakeのquery設計を既存repository key/indexに照らして決め、無限定scanや未根拠GSIを追加しない。

## Implementation plan

- [x] Step 1: 既存ワークスペース構成、U1 TimerSession/OperationReceipt型、repository、CI/test runnerを確認し、U2が追加するfield/APIをU1公開契約に照合する。（US1.3、US1.7、US1.8）
- [x] Step 2: 既存Vitest環境にU2専用のunit/integration test pathsと `npm run test:u2` の正確な実行設定を追加し、coverage計測を維持する。全体80% floorは変更しない。（全担当Story）
- [x] Step 3: Domain/data modelへU2のsession state transition、pendingOperation recovery metadata、U1と同じOperationReceipt schema、version/generation、notification outcomeの型を追加する。状態・版・receiptの条件をdomain validationで定義する。（US1.3–US1.8）
- [x] Step 4: Data model / database behaviorを実装後、schema serialization/undefined omission/TTL/conditional-write intentの単体試験を5–8件追加して実行する。（US1.3、US1.7、US1.8）
- [x] Step 5: Repository / data accessにpause/resume/cancel transaction、operation receipt lookup/commit、pendingOperation lease claim/recovery、reconcilerの限定queryを追加する。session version/state/generationを条件化し、U1 repository contractを拡張する。（US1.3–US1.8）
- [x] Step 6: Repository単体試験を5–8件追加・実行する。同じkeyの再生、version競合、lease失効、遷移後receipt未確定、別operationとの並行更新を含める。（US1.3、US1.4–US1.8）
- [x] Step 7: Business logicにpause/resume/cancelとnotification claimの順序制御、durable receipt確定、10秒超のIN_PROGRESS応答、期限/unknown扱いを実装する。lease recoveryで副作用を重複させない。（US1.3–US1.8）
- [x] Step 8: Service/domain単体試験を5–8件追加・実行する。許可状態、成功時version+1、resume時generation+1、pending通知だけの再配置、sent通知の非再送、再開後stale wakeのno-opを含める。（US1.3–US1.8）
- [x] Step 9: API/endpointへpause/resume/cancel routes、JWT/principal/venue operate認可、schema validation、expectedVersion/Idempotency-Key、409/401/403/503の応答を実装する。（US1.3–US1.6）
- [x] Step 10: API handler単体試験を5–8件追加・実行する。認可拒否の無副作用、stale version、重複key、別body再利用、IN_PROGRESSとRetry-Afterを含める。（US1.3–US1.6）
- [x] Step 11: Frontend behaviorに最小のpause/resume/cancel controlとserver state再取得を追加する。data-testidをinteractive elementへ設定し、320 CSS pxで主要状態/操作/エラーを表示、keyboard操作、読み上げ可能な名前・状態、色以外の状態表示を満たす。（US1.3–US1.6）
- [x] Step 12: Frontend単体試験を5–8件追加・実行する。running/paused/terminal、API失敗とstale state、操作中の重複防止、320px、keyboard/focus/accessibility semanticsを確認する。（US1.3–US1.6）
- [x] Step 13: APIとU1 DynamoDB repository、fake clock、Step Functions stub、dispatcher stubを繋ぐU2 integration testsを3境界以上追加・実行する。pause/cancelとclaim両順序、resumeのwake登録失敗/応答不明/再照合、期限/重複/unknown通知を含める。（US1.3、US1.7、US1.8）
- [x] Step 14: CDKへU2 API route、必要なLambda設定/IAM、既存DynamoDB access、Step Functions registration/reconciler、CloudWatch log/metrics/alarmsを更新する。U1共有table/state machine/scheduler/topicを重複作成せず、必要query/indexはソース実装と費用根拠を確認してから選ぶ。（US1.3–US1.8）
- [x] Step 15: CDK assertionを追加してU2 route、resource-scoped IAM、期限回復設定、保持期間、monitoringと環境分離を確認する。U2-specific deployのためにAWS認証情報をPR CIへ渡さない。（US1.3–US1.8）
- [x] Step 16: API/型/画面の利用手順とU2 test instructionsを更新し、全Story・詳細NFR・BRを実ファイルへtraceする。Source manifestに変更した全workspace application sourceを列挙する。（全担当Story）
- [x] Step 17: U1の既存作業ブランチ `feature/iot-lt-timer` をU1用のPR元として保ち、U2専用 `feature/u2-timer-controls` をU1ブランチから分岐してU2差分をコミットし、U2専用PRを作成する。U2 PRはU1 PRをbaseにしたstacked PRとして作り、U1のmain統合後にbaseをmainへ付け替える。（全担当Story）

## Unit test scope

Standard strategyとして、各テスト可能コンポーネント（domain/data behavior、repository、TimerControl service、API、OperatorInterface）に5–8件の単体試験を用意し、repository/API、service/wake registrar、pause/cancel/dispatcher、画面/APIの主要境界に結合試験を追加する。実AWS、IoT Core資格情報、Pico実機は要求しない。Build and Testで既存全suiteが成功し、アプリケーション全体の行カバレッジ80%以上であることを確認する。U2単体コマンドで全体coverage floorの合否は判定しない。

## Testing Contract

以下のJSONは `aidlc engine testing-posture render` の出力から転記したもの。

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
