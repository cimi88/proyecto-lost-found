export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const DEFAULT_NODE_ENV: NodeEnvironment = 'development';
export const DEFAULT_PORT = 3000;

export interface ValidatedEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  [key: string]: unknown;
}

export interface MatchingConfig {
  trigramThreshold: number;
  candidateLimit: number;
  textWeight: number;
  categoryWeight: number;
  dateWeight: number;
  locationWeight: number;
  suggestionThreshold: number;
  maxSuggestions: number;
  dateWindowDays: number;
}

export const DEFAULT_MATCHING_CONFIG: Readonly<MatchingConfig> = {
  trigramThreshold: 0.15,
  candidateLimit: 500,
  textWeight: 0.5,
  categoryWeight: 0.2,
  dateWeight: 0.15,
  locationWeight: 0.15,
  suggestionThreshold: 0.55,
  maxSuggestions: 10,
  dateWindowDays: 30,
};

function readMatchingNumber(
  config: Record<string, unknown>,
  variable: string,
  defaultValue: number,
): number {
  const rawValue = config[variable];
  const value = rawValue === undefined || rawValue === ''
    ? defaultValue
    : Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${variable} must be a finite number`);
  }

  return value;
}

export function validateMatchingConfig(
  config: Record<string, unknown>,
): MatchingConfig {
  const matching: MatchingConfig = {
    trigramThreshold: readMatchingNumber(
      config,
      'MATCHING_TRIGRAM_THRESHOLD',
      DEFAULT_MATCHING_CONFIG.trigramThreshold,
    ),
    candidateLimit: readMatchingNumber(
      config,
      'MATCHING_CANDIDATE_LIMIT',
      DEFAULT_MATCHING_CONFIG.candidateLimit,
    ),
    textWeight: readMatchingNumber(
      config,
      'MATCHING_TEXT_WEIGHT',
      DEFAULT_MATCHING_CONFIG.textWeight,
    ),
    categoryWeight: readMatchingNumber(
      config,
      'MATCHING_CATEGORY_WEIGHT',
      DEFAULT_MATCHING_CONFIG.categoryWeight,
    ),
    dateWeight: readMatchingNumber(
      config,
      'MATCHING_DATE_WEIGHT',
      DEFAULT_MATCHING_CONFIG.dateWeight,
    ),
    locationWeight: readMatchingNumber(
      config,
      'MATCHING_LOCATION_WEIGHT',
      DEFAULT_MATCHING_CONFIG.locationWeight,
    ),
    suggestionThreshold: readMatchingNumber(
      config,
      'MATCHING_SUGGESTION_THRESHOLD',
      DEFAULT_MATCHING_CONFIG.suggestionThreshold,
    ),
    maxSuggestions: readMatchingNumber(
      config,
      'MATCHING_MAX_SUGGESTIONS',
      DEFAULT_MATCHING_CONFIG.maxSuggestions,
    ),
    dateWindowDays: readMatchingNumber(
      config,
      'MATCHING_DATE_WINDOW_DAYS',
      DEFAULT_MATCHING_CONFIG.dateWindowDays,
    ),
  };

  if (matching.trigramThreshold < 0 || matching.trigramThreshold > 1) {
    throw new Error('MATCHING_TRIGRAM_THRESHOLD must be between 0 and 1');
  }

  if (
    !Number.isInteger(matching.candidateLimit) ||
    matching.candidateLimit < 1 ||
    matching.candidateLimit > 500
  ) {
    throw new Error('MATCHING_CANDIDATE_LIMIT must be an integer between 1 and 500');
  }

  const weights = [
    matching.textWeight,
    matching.categoryWeight,
    matching.dateWeight,
    matching.locationWeight,
  ];

  if (weights.some((weight) => weight < 0 || weight > 1)) {
    throw new Error('MATCHING weights must each be between 0 and 1');
  }

  if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-9) {
    throw new Error('MATCHING weights must sum to 1');
  }

  if (
    matching.suggestionThreshold < 0 ||
    matching.suggestionThreshold > 1
  ) {
    throw new Error('MATCHING_SUGGESTION_THRESHOLD must be between 0 and 1');
  }

  if (
    !Number.isInteger(matching.maxSuggestions) ||
    matching.maxSuggestions < 1 ||
    matching.maxSuggestions > 10
  ) {
    throw new Error('MATCHING_MAX_SUGGESTIONS must be an integer between 1 and 10');
  }

  if (!Number.isInteger(matching.dateWindowDays) || matching.dateWindowDays < 1) {
    throw new Error('MATCHING_DATE_WINDOW_DAYS must be a positive integer');
  }

  return matching;
}

function isNodeEnvironment(value: unknown): value is NodeEnvironment {
  return (
    typeof value === 'string' &&
    (NODE_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

export function validateEnv(
  config: Record<string, unknown>,
): ValidatedEnvironment {
  const rawNodeEnv = config.NODE_ENV;
  const nodeEnv =
    rawNodeEnv === undefined || rawNodeEnv === ''
      ? DEFAULT_NODE_ENV
      : rawNodeEnv;

  if (!isNodeEnvironment(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  const rawPort = config.PORT;
  const port =
    rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return { ...config, NODE_ENV: nodeEnv, PORT: port };
}

export const AUTH_MODES = ['demo', 'jwt'] as const;

export type AuthMode = (typeof AUTH_MODES)[number];

export const DEFAULT_AUTH_MODE: AuthMode = 'demo';

export interface RuntimeEnvironment extends ValidatedEnvironment {
  AUTH_MODE: AuthMode;
  DATABASE_URL: string;
  matching: MatchingConfig;
}

function isAuthMode(value: unknown): value is AuthMode {
  return (
    typeof value === 'string' &&
    (AUTH_MODES as readonly string[]).includes(value)
  );
}

export function validateRuntimeEnv(
  config: Record<string, unknown>,
): RuntimeEnvironment {
  const validated = validateEnv(config);
  const rawAuthMode = config.AUTH_MODE;
  const authMode =
    rawAuthMode === undefined || rawAuthMode === ''
      ? DEFAULT_AUTH_MODE
      : rawAuthMode;

  if (!isAuthMode(authMode)) {
    throw new Error(`AUTH_MODE must be one of: ${AUTH_MODES.join(', ')}`);
  }

  if (validated.NODE_ENV === 'production' && authMode === 'demo') {
    throw new Error('AUTH_MODE=demo is not allowed when NODE_ENV=production');
  }

  const databaseUrl = config.DATABASE_URL;

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }

  return {
    ...validated,
    AUTH_MODE: authMode,
    DATABASE_URL: databaseUrl,
    matching: validateMatchingConfig(config),
  };
}
