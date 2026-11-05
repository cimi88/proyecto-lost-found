import configuration from './configuration';

describe('configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPort = process.env.PORT;

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
  });

  it('uses NODE_ENV=development and PORT=3000 by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;

    expect(configuration()).toEqual({
      nodeEnv: 'development',
      port: 3000,
    });
  });

  it('reads values from the environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4100';

    expect(configuration()).toEqual({
      nodeEnv: 'test',
      port: 4100,
    });
  });

  it('uses defaults when NODE_ENV and PORT are empty', () => {
    process.env.NODE_ENV = '';
    process.env.PORT = '';

    expect(configuration()).toEqual({
      nodeEnv: 'development',
      port: 3000,
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
