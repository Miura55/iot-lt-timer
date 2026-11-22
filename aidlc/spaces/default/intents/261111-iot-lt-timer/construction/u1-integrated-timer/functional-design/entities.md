# U1 データモデル

入力: [U1の範囲](../../../inception/units-generation/unit-of-work.md)、[ストーリー割当](../../../inception/units-generation/unit-of-work-story-map.md)、[stories.md](../../../inception/user-stories/stories.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[components.md](../../../inception/domain-design/components.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)、[回答](functional-design-questions.md)。

以下のYAMLはU1で扱う論理データの正本である。具体的なデータベース、列型、AWSサービスはここでは定めない。通知の予定と送信結果はタイマーと同じTimerControlが所有し、外部送信との間の完全な原子性は前提にしない。

```yaml
entities:
  - name: VenueGrant
    description: 許可済み主催者から共有会場への操作権限
    aggregate_root: true
    attributes:
      - name: grantId
        logical_type: UUID
        required: true
        unique: true
      - name: principalId
        logical_type: String
        required: true
      - name: venueId
        logical_type: String
        required: true
      - name: permissions
        logical_type: Set<String>
        required: true
        allowed_values: [read, configure, operate]
        constraints: 許可のない操作は拒否する。一般自己登録を提供しない。
    entity_constraints:
      - grantIdは不変である。
      - 1会場の許可済み主催者は会場の共有タイマー状態を参照する。
    relationships: []

  - name: TimerSession
    description: 1回のLT発表に対する固定設定・進行状態
    aggregate_root: true
    attributes:
      - name: sessionId
        logical_type: UUID
        required: true
        unique: true
      - name: venueId
        logical_type: String
        required: true
      - name: version
        logical_type: Integer
        required: true
        min: 1
        constraints: 受理された状態変更ごとに増加し、古い版による更新を拒否する。
      - name: state
        logical_type: Enum
        required: true
        allowed_values: [running, paused, completed, cancelled]
      - name: settingsSnapshot
        logical_type: SettingsValue
        required: true
        constraints: durationSecondsとbellsを開始時に複写し、元の保存設定変更の影響を受けない。
      - name: remainingSeconds
        logical_type: Number
        required: true
        min: 0
        max: 10800
        constraints: running中はdeadlineとserverTimeから算出し、応答時に返す。paused中は停止時に保存した値。
      - name: deadline
        logical_type: Nullable<UTC Instant>
        required: true
        constraints: running中は値を持つ。pausedまたは終端ではnull。
      - name: generation
        logical_type: Integer
        required: true
        min: 1
        default: 1
        constraints: 後続のresumeで増加し、古い起床を無効化する。
      - name: deadlineWakeStatus
        logical_type: Enum
        required: true
        allowed_values: [pending, registered, failed]
        constraints: 現generationのdeadline起床の登録状態。起床後の完了処理と再照合は冪等。
      - name: deadlineWakeAttempt
        logical_type: Integer
        required: true
        min: 1
        default: 1
        constraints: 同じ登録試行は同じ決定的execution name/inputを使う。terminal failureが確認された後、条件付き更新でのみ増加する。
      - name: createdAt
        logical_type: UTC Instant
        required: true
      - name: updatedAt
        logical_type: UTC Instant
        required: true
      - name: initiatingPrincipalId
        logical_type: String
        required: true
      - name: startIdempotencyKey
        logical_type: UUID
        required: true
        unique: true
      - name: operationResults
        logical_type: List<OperationReceipt>
        required: true
        constraints: 操作ID・要求指紋・確定結果を7日間再取得できる。資格情報や秘密値は含めない。
    entity_constraints:
      - runningまたはpausedのTimerSessionは同一venueIdにつき最大1件。
      - 作成後のsettingsSnapshotは不変。
      - deadlineはUTCの瞬間として扱い、表示時刻のタイムゾーンと分離する。
      - remainingSecondsが0でも、remainingAtRingが0の通知が未確定ならrunningを保ち、終了通知の有効期限が確定した後にcompletedへ移る。
    relationships:
      - target: ScheduledNotification
        cardinality: one-to-zero-or-ten
        direction: TimerSession owns ScheduledNotification records by sessionId.
      - target: VenueGrant
        cardinality: many-to-one
        direction: initiatingPrincipalId and venueId are checked against the grant; no mutable grant object is embedded.

  - name: ScheduledNotification
    description: 一意な予定時刻とベル命令送信のライフサイクル
    aggregate_root: false
    attributes:
      - name: notificationId
        logical_type: UUID
        required: true
        unique: true
      - name: sessionId
        logical_type: UUID
        required: true
        references: TimerSession.sessionId
      - name: generation
        logical_type: Integer
        required: true
        min: 1
      - name: remainingAtRing
        logical_type: Integer
        required: true
        min: 0
        max: 10800
      - name: scheduledAt
        logical_type: Nullable<UTC Instant>
        required: true
        constraints: paused中はnull。running中はdeadlineからremainingAtRingを差し引いた時刻。
      - name: expiresAt
        logical_type: Nullable<UTC Instant>
        required: true
        constraints: running中はscheduledAt+5秒。paused中はnull。
      - name: ringCount
        logical_type: Integer
        required: true
        allowed_values: [1, 2, 3]
      - name: status
        logical_type: Enum
        required: true
        allowed_values: [pending, dispatching, sent, failed, expired, cancelled, unknown]
      - name: dispatchOutcome
        logical_type: Enum
        required: true
        allowed_values: [not_attempted, accepted, rejected, ambiguous]
        constraints: 試行全体の累積結果。優先順位はaccepted（いずれか受付確認）> ambiguous（受付の可能性が残る）> rejected（全試行の不受理が確定）> not_attempted。
      - name: attemptCount
        logical_type: Integer
        required: true
        min: 0
        default: 0
      - name: claimToken
        logical_type: Nullable<UUID>
        required: true
        constraints: dispatching中だけ値を持つ。期限付き排他claimを識別する。
      - name: claimExpiresAt
        logical_type: Nullable<UTC Instant>
        required: true
        constraints: claim回復用の上限時刻。
      - name: wakeStatus
        logical_type: Enum
        required: true
        allowed_values: [pending, registered, failed]
        constraints: 現generationのnotification起床の登録状態。起床側claimは重複実行に耐える。
      - name: wakeAttempt
        logical_type: Integer
        required: true
        min: 1
        default: 1
        constraints: 同じ登録試行は同じ決定的execution name/inputを使う。terminal failureが確認された後、条件付き更新でのみ増加する。
      - name: createdAt
        logical_type: UTC Instant
        required: true
      - name: updatedAt
        logical_type: UTC Instant
        required: true
    entity_constraints:
      - 同一sessionId内でremainingAtRingは重複しない。
      - 1 TimerSessionあたり0〜10件。
      - 通知の並び順はremainingAtRingの降順（イベント進行順はscheduledAtの昇順）。
      - pause/resumeでは同じnotificationIdを保持し、世代と時刻を更新する。terminal状態は再送しない。
      - 各generationの起床登録はnotificationId・generation・wakeAttemptから決まる登録キーで冪等化する。曖昧な登録結果は同一キーの状態を調べ、故障確定前にattemptを増やさない。
      - いずれかの試行で受付が確認できたらdispatchOutcome=accepted・status=sentとする。受付確認が一度もなく曖昧な試行が残る場合、expiresAtでdispatchOutcome=ambiguous・status=unknownとする。曖昧な試行がなく全試行が不受理ならstatus=failed。
      - 内部status=dispatchingはAPIでpendingへ写像する。画面は「送信処理中」と補足し、送信受付や物理鳴動と混同させない。
      - 通知があるsessionはdeadline到達後かつ全通知が終端状態になってからcompletedとする。通知が0件ならdeadline起床でdeadline時にcompletedとする。独立照合は60秒ごとに行い、session完了回復は通知0件ならdeadline+65秒、通知ありならmax(deadline, 最新expiresAt+65秒)を目標とする。
    relationships:
      - target: TimerSession
        cardinality: many-to-one
        direction: Each ScheduledNotification belongs to one TimerSession.

value_objects:
  - name: SettingsValue
    description: 発表時間と不変の開始時設定
    attributes:
      - name: durationSeconds
        logical_type: Integer
        required: true
        min: 1
        max: 10800
      - name: bells
        logical_type: List<BellPoint>
        required: true
        min_items: 0
        max_items: 10
        constraints: 各時刻は重複不可。隣接する予定時刻差は2秒以上。
  - name: BellPoint
    description: 残り時間と命令回数の組
    attributes:
      - name: remainingSeconds
        logical_type: Integer
        required: true
        min: 0
        max: 10800
        constraints: durationSeconds以下。0は終了時、durationSecondsと同値は開始直後。
      - name: ringCount
        logical_type: Integer
        required: true
        allowed_values: [1, 2, 3]
  - name: OperationReceipt
    description: HTTP状態変更の冪等性と再取得に使う記録
    attributes:
      - name: idempotencyKey
        logical_type: UUID
        required: true
        unique: true
      - name: route
        logical_type: String
        required: true
      - name: requestFingerprint
        logical_type: String
        required: true
      - name: responseStatus
        logical_type: Integer
        required: true
      - name: responseBody
        logical_type: Structured Value
        required: true
      - name: expiresAt
        logical_type: UTC Instant
        required: true
        constraints: 作成時から7日後。

relationships:
  - from: TimerSession
    to: ScheduledNotification
    cardinality: one-to-zero-or-ten
    direction: TimerSession owns notifications.
  - from: TimerSession
    to: VenueGrant
    cardinality: many-to-one
    direction: Session operation is authorized by principalId and venueId.
```

U1が永続所有する主な集約はTimerSessionとその通知群である。VenueGrantは認証・権限境界を表し、実際のID発行・保存方式はInfrastructure Designで確定する。SettingsValueは開始時の値オブジェクトで、保存設定はU3のSettingsManagementが後続追加する。
