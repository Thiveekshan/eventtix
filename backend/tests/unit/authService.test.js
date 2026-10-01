'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { createAuthService } = require('../../src/services/authService');
const { createFakeDb, createFakeUserRepository } = require('../helpers/fakes');

const config = { bcryptRounds: 4, jwtSecret: 'unit-test-secret', jwtExpiresIn: '1h' };

function setup(users = []) {
  const userRepository = createFakeUserRepository(users);
  const service = createAuthService({ db: createFakeDb(), userRepository, config });
  return { service, userRepository };
}

describe('authService', () => {
  describe('register', () => {
    test('stores a hashed password, never the plain text (FR3)', async () => {
      const { service, userRepository } = setup();
      await service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' });

      const stored = userRepository.store[0];
      expect(stored.passwordHash).not.toBe('secret-pass');
      expect(await bcrypt.compare('secret-pass', stored.passwordHash)).toBe(true);
    });

    test('never returns the password hash', async () => {
      const { service } = setup();
      const result = await service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' });
      expect(result.user).toEqual({ id: 1, name: 'Ann', email: 'ann@example.com', role: 'user' });
    });

    test('ignores a role sent by the client', async () => {
      const { service } = setup();
      const result = await service.register({
        name: 'Eve',
        email: 'eve@example.com',
        password: 'secret-pass',
        role: 'admin',
      });
      expect(result.user.role).toBe('user');
    });

    test('rejects a duplicate email with 409', async () => {
      const { service } = setup([{ id: 1, email: 'ann@example.com' }]);
      await expect(
        service.register({ name: 'Ann', email: 'ANN@example.com', password: 'secret-pass' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    test('maps a database unique violation to 409 (two sign-ups at the same moment)', async () => {
      const { service, userRepository } = setup();
      userRepository.create = async () => {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      };
      await expect(
        service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    test('passes unexpected database errors through', async () => {
      const { service, userRepository } = setup();
      userRepository.create = async () => {
        throw new Error('connection lost');
      };
      await expect(
        service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    let service;

    beforeEach(async () => {
      ({ service } = setup());
      await service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' });
    });

    test('returns a token and user for correct credentials (FR2)', async () => {
      const result = await service.login({ email: 'ann@example.com', password: 'secret-pass' });
      expect(result.user.email).toBe('ann@example.com');
      const payload = jwt.verify(result.token, config.jwtSecret);
      expect(payload.sub).toBe('1');
      expect(payload.role).toBe('user');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    test('rejects a wrong password with the same message as an unknown email', async () => {
      const wrongPassword = service.login({ email: 'ann@example.com', password: 'wrong-pass' });
      const unknownEmail = service.login({ email: 'nobody@example.com', password: 'secret-pass' });
      await expect(wrongPassword).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' });
      await expect(unknownEmail).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' });
    });
  });

  describe('verifyToken', () => {
    test('accepts a token it issued', async () => {
      const { service } = setup();
      await service.register({ name: 'Ann', email: 'ann@example.com', password: 'secret-pass' });
      const { token } = await service.login({ email: 'ann@example.com', password: 'secret-pass' });
      expect(service.verifyToken(token)).toEqual({ id: 1, name: 'Ann', role: 'user' });
    });

    test('rejects garbage, a wrong signature and an expired token', () => {
      const { service } = setup();
      const forged = jwt.sign({ role: 'admin' }, 'some-other-secret', { subject: '1' });
      const expired = jwt.sign({ role: 'user' }, config.jwtSecret, { subject: '1', expiresIn: -10 });

      for (const token of ['not-a-token', forged, expired]) {
        expect(() => service.verifyToken(token)).toThrow(/Invalid or expired token/);
      }
    });

    test('rejects a token signed with the "none" algorithm', () => {
      const { service } = setup();
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString('base64url');
      expect(() => service.verifyToken(`${header}.${body}.`)).toThrow(/Invalid or expired token/);
    });
  });
});
