# U1 業務ルール

入力: [U1の範囲](../../../inception/units-generation/unit-of-work.md)、[ストーリー割当](../../../inception/units-generation/unit-of-work-story-map.md)、[stories.md](../../../inception/user-stories/stories.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[components.md](../../../inception/domain-design/components.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)、[回答](functional-design-questions.md)。

以下のYAMLはU1のルールの正本である。各ルールは受け入れ条件・機能要件へ対応づける。

```yaml
rules:
  - id: BR1.1
    statement: 認証済みで会場権限を持つ主催者だけが会場の設定・状態・通知を読み書きできる。
    category: authorization
    applies_to: all API operations
    trigger: request received
    logic: IF token is absent, invalid, expired, or principal lacks the venue permission THEN reject before reading or mutating protected state.
    violation: Return UNAUTHENTICATED or FORBIDDEN; do not disclose protected data.
    source: [FR1, NFR3, AC1.1.1, AC1.1.2, AC1.1.3]

  - id: BR1.2
    statement: 発表時間は1から10800秒の整数、通知は0から10件で時刻は重複せず2秒以上離れ、回数は1/2/3のみ。
    category: validation
    applies_to: start-session settings
    trigger: before session creation
    logic: IF duration, notification count, remaining time, uniqueness, spacing, or ring count violates its inclusive bounds THEN reject the full request without creating a session or notification.
    violation: Return VALIDATION_ERROR with field names; preserve client draft.
    source: [FR2, FR3, AC1.2.1, AC1.2.2]

  - id: BR1.3
    statement: 同一会場に進行中または停止中の発表は最大1件。
    category: constraint
    applies_to: TimerSession per venue
    trigger: start-session request
    logic: IF an active session exists THEN reject a different new start; concurrent starts are serialized by a durable conditional write.
    violation: Return ACTIVE_SESSION or VERSION_CONFLICT; do not create a second session.
    source: [FR4, FR14, AC1.3.3]

  - id: BR1.4
    statement: 開始は設定を固定したTimerSessionを一度だけ作り、各BellPointをScheduledNotificationへ変換する。
    category: policy
    applies_to: start-session
    trigger: authorized valid start with Idempotency-Key
    logic: IF same venue, principal, route, key, and payload were already accepted THEN return the stored result; ELSE durably create one session and its notifications before returning success.
    violation: Key reuse with different content returns IDEMPOTENCY_CONFLICT; a concurrent active session returns a conflict.
    source: [FR4, FR13, FR14, AC1.3.1]

  - id: BR1.5
    statement: サーバーのUTC deadlineが発表時間の基準であり、クライアント表示や再接続は時間進行を変更しない。
    category: calculation
    applies_to: running TimerSession
    trigger: start accepted or state read
    logic: Set deadline=start instant+duration; calculate remaining=max(0, deadline-serverTime); for each bell calculate scheduledAt=deadline-remainingAtRing and expiresAt=scheduledAt+5 seconds.
    violation: Invalid or unavailable server state is not inferred from browser time; return a visible service error and no success claim.
    source: [FR5, FR6, NFR2, AC1.3.1, AC1.3.2, AC1.3.4]

  - id: BR1.6
    statement: 起床イベント自体に送信権限はなく、現在状態を再確認したTimerControlだけが通知送信を許可する。
    category: authorization
    applies_to: scheduled wake and notification dispatch
    trigger: wake received
    logic: IF session, generation, running state, notification identity, pending status, scheduled time, and expiry all pass a fresh durable check THEN claim dispatch atomically; otherwise perform no external send.
    violation: Stale, duplicate, early, cancelled, or expired wake is a no-op or records expiry; it never authorizes a bell command.
    source: [FR5, FR11, FR14, NFR2, AC1.7.3]

  - id: BR1.7
    statement: 1通知の外部送信はclaimにより並行実行を抑止し、同じnotificationIdをMQTT commandIdとして用いる。
    category: constraint
    applies_to: ScheduledNotification dispatch
    trigger: due notification claim
    logic: IF a valid claim is acquired THEN mark dispatching with a bounded lease and stable commandId; IF another worker sees an unexpired claim THEN it does not publish.
    violation: Expired claims are reconciled against the notification deadline; unknown outcomes are never represented as sent.
    source: [FR10, FR11, FR14, NFR2, AC1.7.1]

  - id: BR1.8
    statement: 通知はscheduledAtより前に送らず、scheduledAtから5秒以上経過後は送らない。
    category: constraint
    applies_to: MQTT publish
    trigger: before each publish attempt
    logic: IF serverTime < scheduledAt THEN reschedule; IF serverTime >= expiresAt THEN mark expired unless a prior ambiguous attempt requires unknown; ELSE publish the unchanged command.
    violation: No command is published after expiry, including during scheduler recovery.
    source: [FR11, FR12, AC1.7.3]

  - id: BR1.9
    statement: 不明結果の再試行は期限内に限り同一commandIdと同一payloadで短く行い、期限後は再送しない。
    category: policy
    applies_to: ambiguous AWS IoT publish result
    trigger: transport timeout or connection loss after publish may have been accepted
    logic: IF outcome is ambiguous and expiry remains THEN retry with bounded backoff using the same commandId and payload; IF expiry arrives without a definitive result THEN record unknown.
    violation: Never mint a new commandId for a retry; never retry at or after expiry.
    source: [FR10, FR11, FR12, AC1.7.1, AC1.7.2, AC1.7.3]

  - id: BR1.10
    statement: sentはAWS IoT Coreの受付確認、failedは不受理が確定した結果、unknownは受付の有無が期限内に確定しない結果を示す。
    category: policy
    applies_to: notification outcome
    trigger: publish attempt settles or expires
    logic: IF accepted THEN sent; IF definitively rejected without any prior ambiguous attempt THEN failed; IF any ambiguous result remains unresolved at expiry THEN unknown; IF never attempted and expiry passes THEN expired.
    violation: No status implies Pico receipt or physical ringing; status is shown as text, not inferred from connectivity.
    source: [FR10, FR12, NFR1, AC1.7.1, AC1.7.2, AC1.7.4]

  - id: BR1.11
    statement: remainingSecondsが0でも終了通知の送信結果が未確定なら、期限確定まではTimerSessionをrunningで保持する。
    category: policy
    applies_to: zero-remaining notification
    trigger: deadline reached with BellPoint.remainingSeconds=0
    logic: IF a zero-remaining notification is pending or dispatching THEN return remainingSeconds=0 and keep state running until sent, failed, unknown, cancelled, or expired; THEN mark session completed once all scheduled notifications are terminal.
    violation: A due end bell is not suppressed merely because the display reached zero; the UI may label the zero state as end-notification processing.
    source: [FR3, FR5, FR6, FR10, NFR2, AC1.2.1, AC1.3.2, AC1.7.1]

  - id: BR1.12
    statement: 状態・通知変更と外部送信の原子性を仮定せず、状態変更は永続化後に応答し、送信競合は明示状態で回復する。
    category: constraint
    applies_to: persistence and MQTT boundary
    trigger: state write, scheduler registration, or publish outcome
    logic: Persist session and notifications atomically within the application store; schedule registration is repeatable from durable pending records; a publish occurs outside the store transaction after a conditional claim; reconcile outcomes by claim token and stable IDs.
    violation: A partial scheduler failure does not falsely report that no session exists; it is retried from durable pending state and surfaced if unresolved.
    source: [FR4, FR5, FR10, FR14, NFR2, NFR3, AC1.3.1, AC1.3.4]

  - id: BR1.13
    statement: 操作結果と通知履歴は識別子で追跡し7日後に削除し、資格情報・証明書・秘密値をログへ出さない。
    category: policy
    applies_to: operation receipts and logs
    trigger: result persistence and retention cleanup
    logic: Persist minimum outcome metadata and request identifiers; delete retained operational records after 7 days; exclude credentials and secrets from payload logging.
    violation: Logging failure does not change an already committed user action; secret detection blocks emission.
    source: [NFR3, NFR5, AC1.7.4]
```

| ルール | 要約 |
|---|---|
| BR1.1–BR1.2 | 認可と境界値検証をAPI側で強制する。 |
| BR1.3–BR1.5 | 同時1件、冪等開始、UTC deadlineから状態を算出する。 |
| BR1.6–BR1.8 | 古い起床を捨て、期限内のclaimだけ送信する。 |
| BR1.9–BR1.10 | 不明時は同じ命令を期限内だけ再試行し、送信受付と鳴動を区別する。 |
| BR1.11–BR1.13 | 終了通知、永続化回復、ログ保持と秘密保護を定義する。 |
