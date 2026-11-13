# U2 タイマー制御のデータモデル

入力: [実装単位](../../../inception/units-generation/unit-of-work.md)、[ストーリー割当](../../../inception/units-generation/unit-of-work-story-map.md)、[stories.md](../../../inception/user-stories/stories.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[components.md](../../../inception/domain-design/components.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)、[U1データモデル](../../u1-integrated-timer/functional-design/entities.md)、[回答](functional-design-questions.md)。

U2はU1が所有するTimerSessionとScheduledNotificationを拡張する。論理モデルの正本は以下の差分であり、永続化サービス・物理キー・トランザクション方式は後続の設計で決める。状態変更と通知送信の間に完全な分散原子性があるとはみなさない。

```yaml
entities:
  - name: TimerOperationReceipt
    description: C1の状態変更要求を冪等に再取得する7日保持の確定結果
    aggregate_root: false
    attributes:
      - name: idempotencyKey
        logical_type: UUID
        required: true
        unique: true
      - name: sessionId
        logical_type: UUID
        required: true
        references: TimerSession.sessionId
      - name: venueId
        logical_type: String
        required: true
      - name: principalId
        logical_type: String
        required: true
      - name: route
        logical_type: Enum
        required: true
        allowed_values: [pause, resume, cancel]
      - name: requestFingerprint
        logical_type: SHA256
        required: true
        constraints: canonical route, sessionId, expectedVersion, venueId, and principalId; no credentials or secret values.
      - name: status
        logical_type: Enum
        required: true
        allowed_values: [in_progress, completed]
      - name: responseVersion
        logical_type: Nullable<Integer>
        required: true
      - name: responseState
        logical_type: Nullable<Enum>
        required: true
        allowed_values: [running, paused, completed, cancelled]
      - name: responseSnapshot
        logical_type: Nullable<State>
        required: true
        constraints: Stored only when the operation has a durable final response.
      - name: createdAt
        logical_type: UTC Instant
        required: true
      - name: expiresAt
        logical_type: UTC Instant
        required: true
        constraints: createdAt plus 7 days.
    entity_constraints:
      - A repeated key with the same fingerprint returns the stored final response or IN_PROGRESS while unresolved.
      - A repeated key with a different fingerprint returns IDEMPOTENCY_CONFLICT.
      - Receipt retention is seven days; credentials and secret values are never stored.
    relationships:
      - target: TimerSession
        cardinality: many-to-one
        direction: A receipt records one operation against one session.

  - name: TimerSession
    description: U1-owned session with U2 operation concurrency semantics
    aggregate_root: true
    attributes:
      - name: version
        logical_type: Integer
        required: true
        constraints: Incremented once per accepted pause, resume, or cancel state transition; stale expectedVersion is rejected.
      - name: state
        logical_type: Enum
        required: true
        allowed_values: [running, paused, completed, cancelled]
      - name: remainingSeconds
        logical_type: Number
        required: true
        min: 0
        max: 10800
        constraints: Frozen on pause; on resume derived from the frozen value and new server UTC deadline.
      - name: deadline
        logical_type: Nullable<UTC Instant>
        required: true
        constraints: Non-null only while running.
      - name: generation
        logical_type: Integer
        required: true
        min: 1
        constraints: Incremented on resume to invalidate every wake from an earlier running period.
    entity_constraints:
      - At most one session per venue may be running or paused.
      - A successful pause or cancel prevents new notification claims after its durable transition wins the version/state race.
      - A successful resume schedules only pending notifications in a new generation; terminal notification outcomes remain immutable.
    relationships:
      - target: TimerOperationReceipt
        cardinality: one-to-many
        direction: Session operation history is indexed by idempotencyKey and expires after seven days.
      - target: ScheduledNotification
        cardinality: one-to-many
        direction: Session state transitions control pending notifications; dispatch results remain owned by TimerControl.
```

| Entity | U2で確定する点 |
|---|---|
| TimerOperationReceipt | 操作キー・要求指紋・確定応答を保存し、タイムアウト後も同じキーで結果を取得する。 |
| TimerSession | `version`で競合を検出し、`generation`で再開前の古い起床を無効にする。 |
| ScheduledNotification | pendingのみを再開時に再予定し、sent / failed / expired / cancelled / unknownは再送しない。 |

<!-- Text fallback: One session owns its notification schedule and operation receipts. A version orders accepted controls; a generation distinguishes each resumed run. -->
