'use strict';

/**
 * An error that is safe to show to the client.
 * `reason` is a short machine-friendly label used for metrics (e.g. "sold_out").
 */
class AppError extends Error {
  constructor(status, message, reason = 'error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.reason = reason;
  }
}

module.exports = { AppError };
