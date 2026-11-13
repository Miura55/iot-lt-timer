type Operation = 'pause' | 'resume' | 'cancel' | 'reconcile' | 'notification';
type Result =
  | 'accepted'
  | 'conflict'
  | 'forbidden'
  | 'rejected'
  | 'recovered'
  | 'pending'
  | 'repaired'
  | 'unknown';

export function operationEvent(args: {
  event: string;
  operation: Operation;
  result: Result;
  sessionId?: string;
  operationKey?: string;
  notificationId?: string;
  version?: number;
  generation?: number;
  requestId?: string;
  timestamp?: Date;
}) {
  const timestamp = (args.timestamp ?? new Date()).toISOString();
  const { timestamp: _timestamp, ...fields } = args;
  console.info(JSON.stringify({ ...fields, timestamp }));
  const metric =
    args.result === 'accepted'
      ? 'ControlAccepted'
      : args.result === 'conflict'
        ? 'ControlConflict'
        : args.result === 'forbidden'
          ? 'ControlForbidden'
          : args.result === 'rejected'
            ? 'ControlRejected'
            : args.result === 'recovered'
              ? 'OperationLeaseRecovered'
              : args.result === 'pending'
                ? 'OperationLeasePending'
                : args.result === 'repaired'
                  ? 'WakeRepair'
                  : 'NotificationUnknown';
  console.info(
    JSON.stringify({
      _aws: {
        Timestamp: Date.parse(timestamp),
        CloudWatchMetrics: [
          {
            Namespace: 'IoTLtTimer/U2',
            Dimensions: [['Environment', 'Operation', 'Result']],
            Metrics: [{ Name: metric, Unit: 'Count' }],
          },
        ],
      },
      Environment: process.env.ENVIRONMENT ?? 'local',
      Operation: args.operation,
      Result: args.result,
      [metric]: 1,
    }),
  );
}
