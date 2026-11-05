export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const DEFAULT_NODE_ENV: NodeEnvironment = 'development';
export const DEFAULT_PORT = 3000;

export interface ValidatedEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  [key: string]: unknown;
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
