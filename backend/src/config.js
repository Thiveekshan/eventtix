'use strict';

const pkg = require('../package.json');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function list(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  appEnvironment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  // Secrets always come from the environment, never from the code.
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,

  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:8080,http://localhost:5173'),

  // Release information, injected by the pipeline at build time.
  version: process.env.APP_VERSION || pkg.version,
  build: process.env.BUILD_NUMBER || 'local',
  commit: process.env.GIT_COMMIT || 'unknown',

  // Optional first-run data.
  adminName: process.env.ADMIN_NAME || 'Administrator',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  seedDemoData: process.env.SEED_DEMO_DATA === 'true',
};

module.exports = config;
