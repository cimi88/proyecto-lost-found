import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('applies the documented defaults when variables are absent', () => {
    expect(validateEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
    });
  });

  it('applies defaults when NODE_ENV and PORT are empty', () => {
    expect(validateEnv({ NODE_ENV: '', PORT: '' })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
    });
  });

  it('accepts valid values and normalizes PORT to a number', () => {
    expect(validateEnv({ NODE_ENV: 'test', PORT: '4000' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 4000,
    });
  });

  it.each(['abc', '0', '65536', '12.5'])(
    'rejects invalid PORT %s without exposing the received value',
    (value) => {
      let caught: Error | undefined;

      try {
        validateEnv({ PORT: value });
      } catch (error) {
        caught = error as Error;
      }

      expect(caught).toBeDefined();
      expect(caught?.message).toContain('PORT');
      expect(caught?.message).not.toContain(value);
    },
  );

  it('rejects an invalid NODE_ENV without exposing the received value', () => {
    let caught: Error | undefined;

    try {
      validateEnv({ NODE_ENV: 'staging' });
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('NODE_ENV');
    expect(caught?.message).not.toContain('staging');
  });
});
