## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-12T17:40:23Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Critical | apps/web/src/timer-app.tsx > loadState / API_URL | VITE_API_URL 未設定時の空文字は main.tsx と CloudFront の同一オリジン構成では有効だが、loadState は `!API_URL` で常に終了する。現在のビルド設定では状態を一度も取得できず、state が null のまま開始ボタンが無効になる。 | 空文字でも `/v1/state` を取得できるようにし、配信時と同じ環境変数未設定の条件でログイン後の状態取得・開始操作を検証する。 | Resolved (reviewer) |
| R-02 | Critical | infra/src/timer-stack.ts > DispatchHandler environment; apps/api/src/main.ts > loadConfig | STATE_MACHINE_ARN を追加しているのは API と Reconciler だけだが、Dispatcher も同じ main.ts を読み込み、loadConfig がこの変数を必須としている。Dispatcher はコールドスタートで失敗し、通知 wake と終了 wake を処理できない。 | Dispatcher の環境変数を満たすか、ハンドラごとに設定読み込みを分割する。各 Lambda の実際の環境変数で初期化できることを CDK assertion 等で検証する。 | Resolved (reviewer) |
| R-03 | Major | apps/api/src/timer/dispatcher.ts > createDispatcher; apps/api/src/timer/reconciler.ts > dispatch recovery | Dispatcher は pending 以外を直ちに拒否する一方、2回の不成功が有効期限前に終わると dispatching を保存する。Reconciler がその通知を再投入しても拒否され、期限切れ後も unknown/failed へ確定しない。処理中クラッシュによる lease 残留も同じで、セッションが running のまま残る。 | dispatching の lease 失効・期限到達を処理する回復経路を実装し、累積送信結果を保持して期限時に確定する。送信後クラッシュ、曖昧応答、確定拒否、重複 wake を fake clock と永続化境界を含むテストで検証する。 | Unresolved |
| R-04 | Critical | apps/api/src/main.ts > DynamoDBDocumentClient.from; apps/api/src/timer/dispatcher.ts > updated; apps/api/src/timer/wake-registrar.ts > setWakeState | DocumentClient は undefined 除去を設定していないが、通知結果に claimToken/claimExpiresAt の undefined、wake 登録結果に lastError の undefined を明示的に保存している。使用中の marshaller で同じ値を検証すると `Pass options.removeUndefinedValues=true...` で失敗する。MQTT 送信成功後にも結果保存が失敗し、回復状態が残る。 | undefined の属性を保存前に取り除くか適切な marshalling 設定を適用し、実際の DocumentClient の変換を通す通知結果・wake 状態の repository テストを追加する。 | Resolved (reviewer) |
| R-05 | Major | apps/api/src/timer/http-handler.ts > POST /v1/sessions; apps/api/src/timer/service.ts > startTimer | C1 の inline 設定入力は `{settings: ...}` だが、実装は body 全体を validateSettings に渡すため契約どおりの入力を拒否する。正常応答も C1 の 201 State ではなく 202 の別形式であり、検証例外は 400 ではなく 503 になる。同じキーの再試行では初回に存在する state が欠落することも実テストで再現した。 | U1 の inline 入力・応答・検証エラーを C1 に合わせ、最初に返した応答を同じキーでそのまま再返却する。UI の送信形も合わせる。保存済み設定の U3 担当分は境界として明示する。 | Resolved (reviewer) |
| R-06 | Major | apps/api/src/timer/wake-registrar.ts > register / reconcile | ExecutionAlreadyExists を登録成功とみなし、reconcile でも FAILED/TIMED_OUT/ABORTED を registered にしている。これは「既存実行の確定失敗後にだけ attempt を進めて再登録する」という承認済み回復設計を実装しておらず、失敗した wake を回復できない。 | 同一実行の状態を確認し、実行中・成功・確定失敗・不明を分ける。確定失敗時は generation/attempt を条件に attempt を進め、不明時は同じ名前と入力を維持する。対応する SDK モックテストを追加する。 | Resolved (reviewer) |
| R-07 | Major | apps/api/src/timer/dynamo-repository.ts > getActiveSession / getGrant; apps/api/src/timer/service.ts > startTimer | startTimer は終了条件を満たした古い running を確認・完了せず ACTIVE_SESSION で拒否する。さらに getActiveSession は completed を除外するため、終了後の次の GET では C1 の直近セッションと通知結果が null になる。画面を閉じた後の再開時に終了結果を復元できない。 | 開始時にも期限と全通知の終端を照合して古い active を解消し、active 制御と直近セッションの取得を分ける。GET を挟まない次回開始と終了後再読み込みを実 repository 形状で検証する。 | Resolved (reviewer) |
| R-08 | Major | apps/api/src/timer/dynamo-repository.ts > getGrant; apps/api/src/timer/service.ts > startTimer | getGrant は grant レコードの存在だけを boolean で返し、定義済みの permissions を評価しない。read 権限だけの利用者も開始操作を実行でき、操作権限の境界が失われている。 | 読み取りと操作に必要な permission をそれぞれ検証し、read のみの grant では開始が 403 になるテストを追加する。 | Resolved (reviewer) |
| R-09 | Major | tests/unit/u1/domain.test.ts > notification timing; tests/unit/u1/service.test.ts > identical idempotent retry; aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/code-generation/unit-test-instructions.md > execution | レビュアーが実行した16件中2件が失敗した。通知順序の期待不一致と、同一キー再試行で応答が変わる不具合である。repository/dispatcher/UI/CDK の検証と80% coverage の証拠もなく、今回検出した実行時障害を型チェックだけでは捉えられていない。既存の未実行説明は明示されているが、現在の実行結果とは更新が必要である。 | 失敗の契約上の期待を確認して修正し、上記の実行境界を対象とする計画済みテストを実装・実行する。coverage を測定し、実行済み・未実行・実機待ちを最新結果で記録する。 | Unresolved |
| R-10 | Minor | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u1-integrated-timer/code-generation/traceability.json > coverage | OK の対象ファイルは存在するが、AC1.8.2 の実機打音検証を dispatcher.ts、AC1.8.3 の実機期限・重複検証を wake-registrar.ts、BR1.1 の認可を validation.ts に割り当てるなど、存在確認と要件実証が混同されている。実機検証未実行という code-summary の説明とも整合しない。 | 実装箇所と検証証拠を正しい対象へ結び直し、実機未実施・他 Unit 担当・未実装を OK で覆わず現状が分かるよう記録する。 | Resolved (reviewer) |

> R-01 Reviewer note: `loadState` no longer exits for an empty `VITE_API_URL`; relative `/v1/state` requests support CloudFront same-origin routing.

> R-02 Reviewer note: `loadConfig` permits the state machine ARN to be absent for the dispatcher, and the dispatcher no longer receives that environment variable.

> R-03 Reviewer note: `dispatcher.ts` marks an expired publish-started lease `unknown` immediately. If an ambiguous attempt still has time before `expiresAt`, recovery does not retry the same command as BR1.9 requires; the added tests cover ambiguous expiry but not this within-expiry recovery.

> R-04 Reviewer note: The DocumentClient enables `removeUndefinedValues`, and repository writes recursively strip undefined values.

> R-05 Reviewer note: Start requests validate `{settings: ...}`, return the persisted 201 state for the same idempotency key, and the UI sends the matching shape.

> R-06 Reviewer note: Duplicate Step Functions execution names are looked up and RUNNING/SUCCEEDED are distinguished from confirmed terminal failures, which advance the attempt.

> R-07 Reviewer note: The repository returns the latest session through the active pointer after terminal completion, and new starts can replace completed/cancelled pointers.

> R-08 Reviewer note: Grant permissions are checked explicitly: state reads require `read`, and starts require `operate`.

> R-09 Reviewer note: The 31-test U1 command passes, but API-handler, UI, and CDK assertion suites are absent and the 80% coverage target has not been measured. The documented runner bootstrap command also fails under npm 12 because `--passWithNoTests` is parsed as an npm config option.

> R-10 Reviewer note: Physical Pico checks are recorded as Deferred with the hardware-not-ready reason, and BR1.1 points to repository authorization enforcement.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npm exec vitest -- run tests/unit/u1 tests/integration/u1` | PASS: 5 files, 31 tests | The command failed inside the sandbox because esbuild could not read the workspace config; rerunning with approved workspace access passed. This does not establish the 80% coverage target. |

### Summary

The implementation is sufficiently structured to continue: authentication, state persistence, wake scheduling, and MQTT dispatch boundaries are represented, and the scoped test command passes. Two material items remain visible for the human to weigh: ambiguous publish recovery does not perform the specified retry while still inside the notification window, and API/UI/CDK tests plus coverage evidence are incomplete. AWS and Pico hardware validation were not performed.
