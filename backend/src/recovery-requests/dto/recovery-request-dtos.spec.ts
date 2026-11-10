import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelRecoveryRequestDto } from './cancel-recovery-request.dto';
import { CompleteRecoveryRequestDto } from './complete-recovery-request.dto';
import { CreateRecoveryRequestDto } from './create-recovery-request.dto';

async function validateDto<T extends object>(
  type: new () => T,
  value: Record<string, unknown>,
) {
  return validate(plainToInstance(type, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('Recovery request DTOs', () => {
  it('trims optional notes and accepts an empty body', async () => {
    const withNotes = plainToInstance(CreateRecoveryRequestDto, {
      notes: '  Tiene una marca azul.  ',
    });
    expect(withNotes.notes).toBe('Tiene una marca azul.');
    expect(await validateDto(CreateRecoveryRequestDto, {})).toHaveLength(0);

    const empty = plainToInstance(CreateRecoveryRequestDto, {
      notes: '   ',
    });
    expect(empty.notes).toBeUndefined();
  });

  it('rejects notes longer than 500 characters', async () => {
    const errors = await validateDto(CreateRecoveryRequestDto, {
      notes: 'a'.repeat(501),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('notes');
  });

  it('rejects unknown create fields', async () => {
    const errors = await validateDto(CreateRecoveryRequestDto, {
      notes: 'ok',
      requesterId: '00000000-0000-4000-8000-000000000001',
      status: 'APPROVED',
    });

    expect(errors.map((error) => error.property).sort()).toEqual([
      'requesterId',
      'status',
    ]);
  });

  it('trims optional return notes and enforces the 500-character limit', async () => {
    const valid = plainToInstance(CompleteRecoveryRequestDto, {
      returnNotes: '  Entregado en la puerta.  ',
    });
    expect(valid.returnNotes).toBe('Entregado en la puerta.');
    expect(await validateDto(CompleteRecoveryRequestDto, valid)).toHaveLength(0);
    expect(await validateDto(CompleteRecoveryRequestDto, {})).toHaveLength(0);

    const tooLong = await validateDto(CompleteRecoveryRequestDto, {
      returnNotes: 'a'.repeat(501),
    });
    expect(tooLong[0]?.property).toBe('returnNotes');
  });

  it('rejects unknown completion fields', async () => {
    const errors = await validateDto(CompleteRecoveryRequestDto, {
      returnNotes: 'ok',
      completedById: '00000000-0000-4000-8000-000000000001',
      status: 'COMPLETED',
    });

    expect(errors.map((error) => error.property).sort()).toEqual([
      'completedById',
      'status',
    ]);
  });

  it('trims the cancellation reason and enforces 3..500 characters', async () => {
    const valid = plainToInstance(CancelRecoveryRequestDto, {
      reason: '  Ya lo encontré.  ',
    });
    expect(valid.reason).toBe('Ya lo encontré.');
    expect(await validateDto(CancelRecoveryRequestDto, valid)).toHaveLength(0);

    const tooShort = await validateDto(CancelRecoveryRequestDto, {
      reason: '  ab  ',
    });
    const tooLong = await validateDto(CancelRecoveryRequestDto, {
      reason: 'a'.repeat(501),
    });

    expect(tooShort[0]?.property).toBe('reason');
    expect(tooLong[0]?.property).toBe('reason');
  });
});
