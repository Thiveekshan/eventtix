'use strict';

const { createAuthMiddleware } = require('../../src/middleware/auth');

const authService = {
  verifyToken: (token) => {
    if (token === 'good-user') return { id: 1, role: 'user' };
    if (token === 'good-admin') return { id: 2, role: 'admin' };
    throw Object.assign(new Error('Invalid or expired token'), { name: 'AppError', status: 401 });
  },
};

const { authenticate, requireRole } = createAuthMiddleware(authService);

function request(authorization) {
  return { get: () => authorization };
}

describe('auth middleware', () => {
  test('authenticate sets req.user for a valid bearer token', () => {
    const req = request('Bearer good-user');
    const next = jest.fn();
    authenticate(req, {}, next);
    expect(req.user).toEqual({ id: 1, role: 'user' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, '', 'good-user', 'Basic good-user', 'Bearer'])(
    'authenticate returns 401 when the header is %p',
    (header) => {
      expect(() => authenticate(request(header), {}, jest.fn())).toThrow(
        expect.objectContaining({ status: 401, message: 'Authentication required' }),
      );
    },
  );

  test('authenticate returns 401 for a bad token', () => {
    expect(() => authenticate(request('Bearer nope'), {}, jest.fn())).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  test('requireRole lets the right role through', () => {
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('BR6: requireRole returns 403 for the wrong role or no user', () => {
    expect(() => requireRole('admin')({ user: { role: 'user' } }, {}, jest.fn())).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => requireRole('admin')({}, {}, jest.fn())).toThrow(expect.objectContaining({ status: 403 }));
  });
});
