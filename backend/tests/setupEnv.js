'use strict';

// Test-only settings. Real secrets are never stored in the repository.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-signing-key-not-used-anywhere-else';
process.env.BCRYPT_ROUNDS = '4';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://localhost:5432/eventtix_test';
