import { getMetadataArgsStorage } from 'typeorm';
import { RecoveryRequest } from './recovery-request.entity';

describe('RecoveryRequest entity metadata', () => {
  it('maps the recovery_requests table and every persisted column', () => {
    const table = getMetadataArgsStorage().tables.find(
      (candidate) => candidate.target === RecoveryRequest,
    );
    const columns = getMetadataArgsStorage().columns.filter(
      (candidate) => candidate.target === RecoveryRequest,
    );

    expect(table?.name).toBe('recovery_requests');
    expect(
      columns.map((column) => column.options.name ?? column.propertyName),
    ).toEqual([
      'id',
      'publication_id',
      'requester_id',
      'status',
      'notes',
      'cancelled_by_id',
      'cancellation_reason',
      'completed_at',
      'completed_by_id',
      'return_notes',
      'created_at',
      'updated_at',
    ]);
    expect(
      columns.find((column) => column.propertyName === 'cancellationReason')
        ?.options,
    ).toMatchObject({ length: 500, nullable: true });
    expect(
      columns.find((column) => column.propertyName === 'returnNotes')?.options,
    ).toMatchObject({ length: 500, nullable: true });
  });
});
