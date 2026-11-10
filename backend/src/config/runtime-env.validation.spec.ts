import {
  DEFAULT_MATCHING_CONFIG,
  validateRuntimeEnv,
} from './env.validation';

const DATABASE_URL = 'postgresql://lostfound_app:secret@localhost:5432/lostfound_dev';

describe('validateRuntimeEnv', () => {
  it('defaults AUTH_MODE to demo in development', () => {
    expect(validateRuntimeEnv({ DATABASE_URL })).toMatchObject({
      NODE_ENV: 'development',
      AUTH_MODE: 'demo',
      DATABASE_URL,
      matching: DEFAULT_MATCHING_CONFIG,
    });
  });

  it('accepts AUTH_MODE=jwt in production', () => {
    expect(
      validateRuntimeEnv({
        DATABASE_URL,
        NODE_ENV: 'production',
        AUTH_MODE: 'jwt',
      }),
    ).toMatchObject({ NODE_ENV: 'production', AUTH_MODE: 'jwt' });
  });

  it('refuses AUTH_MODE=demo in production', () => {
    expect(() =>
      validateRuntimeEnv({
        DATABASE_URL,
        NODE_ENV: 'production',
        AUTH_MODE: 'demo',
      }),
    ).toThrow('AUTH_MODE=demo is not allowed when NODE_ENV=production');
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateRuntimeEnv({})).toThrow('DATABASE_URL is required');
  });

  it('rejects an invalid AUTH_MODE without exposing the received value', () => {
    let caught: Error | undefined;

    try {
      validateRuntimeEnv({ DATABASE_URL, AUTH_MODE: 'anonymous' });
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('AUTH_MODE');
    expect(caught?.message).not.toContain('anonymous');
  });

  it('accepts matching configuration overrides that keep valid ranges and weights', () => {
    expect(
      validateRuntimeEnv({
        DATABASE_URL,
        MATCHING_CANDIDATE_LIMIT: '250',
        MATCHING_MAX_SUGGESTIONS: '5',
      }).matching,
    ).toMatchObject({ candidateLimit: 250, maxSuggestions: 5 });
  });

  it.each([
    { MATCHING_CANDIDATE_LIMIT: '501', variable: 'MATCHING_CANDIDATE_LIMIT' },
    { MATCHING_MAX_SUGGESTIONS: '11', variable: 'MATCHING_MAX_SUGGESTIONS' },
    {
      MATCHING_TEXT_WEIGHT: '0.4',
      MATCHING_CATEGORY_WEIGHT: '0.2',
      MATCHING_DATE_WEIGHT: '0.15',
      MATCHING_LOCATION_WEIGHT: '0.15',
      variable: 'MATCHING weights',
    },
    { MATCHING_DATE_WINDOW_DAYS: '0', variable: 'MATCHING_DATE_WINDOW_DAYS' },
  ])('rejects invalid matching configuration ($variable)', ({ variable, ...input }) => {
    expect(() => validateRuntimeEnv({ DATABASE_URL, ...input })).toThrow(variable);
  });

  it('keeps validating NODE_ENV and PORT first', () => {
    expect(() => validateRuntimeEnv({ PORT: 'not-a-port' })).toThrow('PORT');
    expect(() => validateRuntimeEnv({ NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });
});
