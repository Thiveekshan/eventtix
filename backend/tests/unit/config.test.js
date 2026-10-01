'use strict';

describe('config', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  test('refuses to start without a JWT secret', () => {
    delete process.env.JWT_SECRET;
    expect(() => require('../../src/config')).toThrow('Missing required environment variable: JWT_SECRET');
  });

  test('refuses to start without a database URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => require('../../src/config')).toThrow('Missing required environment variable: DATABASE_URL');
  });

  test('reads settings and release information from the environment', () => {
    process.env.PORT = '4000';
    process.env.BUILD_NUMBER = '57';
    process.env.APP_VERSION = '2.1.0';
    process.env.CORS_ORIGINS = 'https://a.example, https://b.example';
    process.env.SEED_DEMO_DATA = 'true';
    const config = require('../../src/config');
    expect(config.port).toBe(4000);
    expect(config.build).toBe('57');
    expect(config.version).toBe('2.1.0');
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.seedDemoData).toBe(true);
  });

  test('has safe defaults', () => {
    delete process.env.PORT;
    delete process.env.BUILD_NUMBER;
    delete process.env.APP_VERSION;
    const config = require('../../src/config');
    expect(config.port).toBe(3000);
    expect(config.build).toBe('local');
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(config.seedDemoData).toBe(false);
  });
});
