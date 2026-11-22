# U2 タイマー制御の業務ルール

入力: [実装単位](../../../inception/units-generation/unit-of-work.md)、[ストーリー割当](../../../inception/units-generation/unit-of-work-story-map.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[U1業務ルール](../../u1-integrated-timer/functional-design/rules.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)、[回答](functional-design-questions.md)。

```yaml
rules:
  - id: BR2.1
    statement: 状態変更は許可済みのoperate権限を持つ主催者だけが実行できる。
    category: authorization
    applies_to: pause, resume, cancel
    trigger: authenticated control request
    logic: IF principal has operate permission for the server-selected venue THEN continue; ELSE reject without exposing or mutating session state.
    violation: Return 401 or 403 and make no state, notification, or operation-receipt success change.
    source: [FR1, AC1.1.2, AC1.4.1, AC1.5.1, AC1.6.1]

  - id: BR2.2
    statement: 状態変更は期待版を照合し、成功した遷移のみ版を一つ進める。
    category: constraint
    applies_to: TimerSession
    trigger: pause, resume, or cancel
    logic: IF expectedVersion equals the durable session version and the operation is valid for the current state THEN commit the transition and increment version once; ELSE do not mutate and return VERSION_CONFLICT or INVALID_STATE with current state.
    violation: Never overwrite a newer state based on a stale browser view.
    source: [FR6, AC1.3.3, AC1.4.3, AC1.5.3, AC1.6.2]

  - id: BR2.3
    statement: 同一Idempotency-Keyの状態変更再試行は同じ操作の結果を返し、副作用を重ねない。
    category: idempotency
    applies_to: pause, resume, cancel
    trigger: repeated request
    logic: IF key and canonical request fingerprint match a completed receipt THEN return its stored response; IF the matching operation remains unresolved THEN return IN_PROGRESS with Retry-After: 1; IF the fingerprint differs THEN return IDEMPOTENCY_CONFLICT.
    violation: No duplicate state transition, generation increment, or notification cancellation is allowed.
    source: [FR4, FR6, AC1.4.2, AC1.5.2, AC1.6.3]

  - id: BR2.4
    statement: pauseは実行中の残り時間を固定し、未送信通知の再予定を止める。
    category: policy
    applies_to: running TimerSession and pending ScheduledNotification
    trigger: valid pause accepted
    logic: Persist state=paused, remainingSeconds=max(0, deadline-serverTime), deadline=null, and version+1; set pending notifications' scheduledAt/expiresAt to null and invalidate the old generation before returning success.
    violation: No fresh dispatch claim may begin after the pause transition wins; an already acquired dispatch permission is resolved before success is returned.
    source: [FR6, AC1.4.1, AC1.4.3]

  - id: BR2.5
    statement: resumeは保存済み残り時間と未送信通知だけを新しい世代で再開する。
    category: calculation
    applies_to: paused TimerSession
    trigger: valid resume accepted
    logic: Set state=running, deadline=serverTime+remainingSeconds, generation=generation+1, and version=version+1; schedule each pending notification at deadline-remainingAtRing with expiry scheduledAt+5 seconds.
    violation: Sent, failed, expired, cancelled, or unknown notifications are never rescheduled; stale-generation wakes cannot claim or publish.
    source: [FR5, FR6, AC1.5.1, AC1.5.2]

  - id: BR2.6
    statement: cancelは実行中または停止中のセッションを終端化し、未送信通知を無効にする。
    category: policy
    applies_to: running or paused TimerSession
    trigger: valid cancel accepted
    logic: Set state=cancelled, deadline=null, version=version+1; mark pending notifications cancelled and invalidate the current generation before returning success.
    violation: Already sent commands cannot be withdrawn; their outcomes remain immutable and visible.
    source: [FR6, AC1.6.1, AC1.6.2]

  - id: BR2.7
    statement: 状態変更と通知claimは永続化された条件付き競合で直列化する。
    category: constraint
    applies_to: control transition and notification dispatch
    trigger: pause/cancel concurrent with a due notification
    logic: Whichever durable conditional transition wins first determines the order. If a dispatch claim wins first, preserve its stable commandId and wait for accepted/rejected/expiry resolution before reporting pause or cancel complete; otherwise the notification claim observes the new state/version and does not publish.
    violation: Do not report a successful stop while an authorized publish remains unresolved; do not claim that an accepted MQTT command was cancelled.
    source: [FR6, FR10, AC1.4.3, AC1.6.2]

  - id: BR2.8
    statement: 各操作の応答は耐久保存後にのみ成功となり、失敗した応答は成功を推測させない。
    category: policy
    applies_to: control API and operation receipt
    trigger: request processing or client timeout
    logic: Persist session transition and final operation receipt before returning 200; while resolution is pending return 409 IN_PROGRESS; on storage failure return service error and permit same-key retry.
    violation: A client timeout or transport error never implies that the operation did not execute; clients reuse the same key and refresh state.
    source: [FR6, NFR2, AC1.4.2, AC1.6.3]

  - id: BR2.9
    statement: 停止・取消し後も過去の通知結果を改変せず状態として区別して返す。
    category: policy
    applies_to: State response
    trigger: GET /v1/state or successful control response
    logic: Return session state, version, serverTime, remainingSeconds, and each notification's planned or terminal status; present unknown as unresolved delivery, never as success or physical ringing.
    violation: No connectivity or physical actuation claim is inferred from AWS publish acceptance.
    source: [FR10, AC1.7.2, AC1.7.4]

  - id: BR2.10
    statement: 実機の競合・鳴動試験は模擬試験と別の証拠として扱う。
    category: policy
    applies_to: connection validation
    trigger: test planning or result reporting
    logic: Record AC1.8.1 simulation separately; leave AC1.8.2/1.8.3 Deferred until the Pico is available; do not claim safety for close notification spacing before mechanism recovery time is measured.
    violation: Simulator or MQTT service acceptance cannot substitute for physical bell observation.
    source: [FR15, NFR1, NFR6, AC1.8.1, AC1.8.2, AC1.8.3, AC1.8.4]
```

| ルール | 要約 |
|---|---|
| BR2.1–BR2.3 | 認可、version競合、冪等再試行を制御APIで守る。 |
| BR2.4–BR2.6 | 停止・再開・取消しでdeadlineとpending通知を更新する。 |
| BR2.7–BR2.8 | 通知claimと操作を条件付きで直列化し、耐久応答を返す。 |
| BR2.9–BR2.10 | 結果の意味を保ち、模擬と実機の検証証拠を分ける。 |
