export const RECOVERY_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
] as const;

export type RecoveryRequestStatus =
  (typeof RECOVERY_REQUEST_STATUSES)[number];

export const RECOVERY_REQUEST_STATUS_LABELS: Record<
  RecoveryRequestStatus,
  string
> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
};

const STATUS_SET = new Set<string>(RECOVERY_REQUEST_STATUSES);

export function isRecoveryRequestStatus(
  value: unknown,
): value is RecoveryRequestStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function isActiveRecoveryRequestStatus(
  value: RecoveryRequestStatus,
): boolean {
  return value === 'PENDING' || value === 'APPROVED';
}
