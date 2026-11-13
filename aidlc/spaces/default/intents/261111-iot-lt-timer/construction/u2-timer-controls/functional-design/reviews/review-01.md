## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-12T18:43:49Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u2-timer-controls/functional-design/entities.md > TimerOperationReceipt and TimerSession relationship | U2 defines a new TimerOperationReceipt collection, while U1's TimerSession model already requires operationResults containing OperationReceipt records with responseStatus, responseBody, requestFingerprint, and expiry. The U2 model does not map to or replace those fields, so implementers cannot tell which receipt store satisfies C1 replay and retention behavior. | Define one canonical receipt representation and map every required C1 field, including exact first response replay and retention, to it; update the U1/U2 entity boundary consistently. | New |
| R-02 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u2-timer-controls/functional-design/functional-spec.md > 操作ワークフロー, 競合の直列化と回復 | If a worker dies after persisting an unresolved receipt, a matching retry only returns IN_PROGRESS. The design specifies no durable continuation or recovery worker that resolves that receipt, so the operation can remain pending forever and controls can remain blocked. | Specify a durable operation state machine and recovery/reconciliation path that resumes or conclusively fails abandoned operations, including how retries observe the final stored response. | New |
| R-03 | Major | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u2-timer-controls/functional-spec.md > Resume, 競合の直列化と回復 | Resume increments generation, making the prior generation's deadline wake stale, but only pending notification wakes are explicitly re-registered. No replacement session deadline wake is specified. A resumed session can therefore miss its completion trigger, especially when it has no pending notifications. | Require durable registration of the new-generation session deadline wake on resume and define recovery when registration is delayed or fails, consistent with U1's deadline wake model. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u2-timer-controls/functional-design/rules.md > BR2.3 category | BR2.3 uses category `idempotency`, which is outside the functional-design stage's declared category values (`validation`, `authorization`, `constraint`, `calculation`, `policy`). | Use an allowed category, such as `policy`, or update the applicable schema and validator to support `idempotency`. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `aidlc engine sensor fire traceability --stage functional-design --output-path aidlc/spaces/default/intents/261111-iot-lt-timer/construction/u2-timer-controls/functional-design/traceability.json` | PASS | U2 traceability validation passed. |
| Functional-design Mermaid state diagram | PASS by inspection | The `stateDiagram-v2` syntax and transitions are coherent; text fallback is present. |

### Summary

U2 covers the requested pause, resume, cancel, stale-wake, and physical-test deferral concerns, and its traceability sensor passes. Receipt persistence/recovery and resumed deadline scheduling still leave runtime paths underspecified, so implementation would require architectural decisions.
