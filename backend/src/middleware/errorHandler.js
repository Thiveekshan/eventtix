'use strict';

const logger = require('../logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Express recognises an error handler by its four arguments, so `next` must stay.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Known, client-safe errors (validation, permissions, conflicts...).
  if (err.name === 'AppError') {
    return res.status(err.status).json({ error: err.message });
  }
  // Malformed JSON in the request body.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  // Anything else is a bug or an outage: log the detail, show the client nothing sensitive.
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
