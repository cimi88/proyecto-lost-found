import { validateEnv, validateMatchingConfig } from './env.validation';

export default function configuration() {
  const { NODE_ENV, PORT } = validateEnv(process.env);

  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    matching: validateMatchingConfig(process.env),
  };
}
