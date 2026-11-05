import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('startup with invalid environment variables', () => {
  it.each([
    { variable: 'PORT', value: 'not-a-port', env: { PORT: 'not-a-port' } },
    { variable: 'NODE_ENV', value: 'staging', env: { NODE_ENV: 'staging' } },
  ])(
    'exits non-zero when $variable is invalid without exposing the received value',
    ({ variable, value, env }) => {
      const result = spawnSync(
        process.execPath,
        ['-r', 'ts-node/register', join(process.cwd(), 'src', 'main.ts')],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3000',
            ...env,
          },
          encoding: 'utf8',
          timeout: 30000,
        },
      );

      expect(result.status).not.toBe(0);

      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect(output).toContain(variable);
      expect(output).not.toContain(value);
    },
  );
});
