'use strict';

const { AppError } = require('../utils/httpError');

function createAuthMiddleware(authService) {
  /** Requires a valid "Authorization: Bearer <token>" header and sets req.user. */
  function authenticate(req, res, next) {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'Authentication required', 'unauthorised');
    }
    req.user = authService.verifyToken(token);
    next();
  }

  /** BR6: restricts a route to one role (e.g. only admins can manage events). */
  function requireRole(role) {
    return (req, res, next) => {
      if (!req.user || req.user.role !== role) {
        throw new AppError(403, 'You do not have permission to do this', 'forbidden');
      }
      next();
    };
  }

  return { authenticate, requireRole };
}

module.exports = { createAuthMiddleware };
