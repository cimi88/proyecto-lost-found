import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns status ok and an ISO-8601 timestamp', () => {
    const response = new HealthController().check();

    expect(response.status).toBe('ok');
    expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
  });
});
