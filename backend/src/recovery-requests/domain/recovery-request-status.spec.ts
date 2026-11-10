import {
  RECOVERY_REQUEST_STATUSES,
  isActiveRecoveryRequestStatus,
  isRecoveryRequestStatus,
} from './recovery-request-status';

describe('RecoveryRequestStatus', () => {
  it('defines the five approved statuses', () => {
    expect(RECOVERY_REQUEST_STATUSES).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'COMPLETED',
    ]);
  });

  it('accepts only known status values', () => {
    for (const status of RECOVERY_REQUEST_STATUSES) {
      expect(isRecoveryRequestStatus(status)).toBe(true);
    }

    expect(isRecoveryRequestStatus('INVALID')).toBe(false);
    expect(isRecoveryRequestStatus('pending')).toBe(false);
    expect(isRecoveryRequestStatus(undefined)).toBe(false);
    expect(isRecoveryRequestStatus(1)).toBe(false);
  });

  it('identifies active statuses', () => {
    expect(isActiveRecoveryRequestStatus('PENDING')).toBe(true);
    expect(isActiveRecoveryRequestStatus('APPROVED')).toBe(true);
    expect(isActiveRecoveryRequestStatus('REJECTED')).toBe(false);
    expect(isActiveRecoveryRequestStatus('CANCELLED')).toBe(false);
    expect(isActiveRecoveryRequestStatus('COMPLETED')).toBe(false);
  });
});
