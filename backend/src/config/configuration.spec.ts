import configuration from './configuration';
import { DEFAULT_MATCHING_CONFIG } from './env.validation';

describe('configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPort = process.env.PORT;
  const matchingVariables = [
    'MATCHING_TRIGRAM_THRESHOLD',
    'MATCHING_CANDIDATE_LIMIT',
    'MATCHING_TEXT_WEIGHT',
    'MATCHING_CATEGORY_WEIGHT',
    'MATCHING_DATE_WEIGHT',
    'MATCHING_LOCATION_WEIGHT',
    'MATCHING_SUGGESTION_THRESHOLD',
    'MATCHING_MAX_SUGGESTIONS',
    'MATCHING_DATE_WINDOW_DAYS',
  ] as const;
  const originalMatchingValues = new Map(
    matchingVariables.map((variable) => [variable, process.env[variable]]),
  );

  beforeEach(() => {
    for (const variable of matchingVariables) {
      delete process.env[variable];
    }
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }

    for (const variable of matchingVariables) {
      const originalValue = originalMatchingValues.get(variable);

      if (originalValue === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = originalValue;
      }
    }
  });

  it('uses NODE_ENV=development and PORT=3000 by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;

    expect(configuration()).toEqual({
      nodeEnv: 'development',
      port: 3000,
      matching: DEFAULT_MATCHING_CONFIG,
    });
  });

  it('reads values from the environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4100';

    expect(configuration()).toEqual({
      nodeEnv: 'test',
      port: 4100,
      matching: DEFAULT_MATCHING_CONFIG,
    });
  });

  it('uses defaults when NODE_ENV and PORT are empty', () => {
    process.env.NODE_ENV = '';
    process.env.PORT = '';

    expect(configuration()).toEqual({
      nodeEnv: 'development',
      port: 3000,
      matching: DEFAULT_MATCHING_CONFIG,
    });
  });

  it('rejects an invalid PORT through the shared validator', () => {
    process.env.PORT = 'not-a-port';

    expect(() => configuration()).toThrow('PORT');
  });

  it('rejects an invalid NODE_ENV through the shared validator', () => {
    process.env.NODE_ENV = 'staging';

    expect(() => configuration()).toThrow('NODE_ENV');
  });
});
