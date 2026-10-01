'use strict';

const logger = require('../logger');
const metrics = require('../metrics');

const QUIET_ROUTES = new Set(['/health', '/metrics']);

/** Times every request for Prometheus and writes one structured log line for it. */
function requestMetrics(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? `${req.baseUrl}${req.route.path}`.replace(/\/$/, '') || '/' : 'unmatched';

    metrics.httpRequestDuration.observe(
      { method: req.method, route, status_code: String(res.statusCode) },
      seconds,
    );

    if (!QUIET_ROUTES.has(route)) {
      logger.info('request', {
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(seconds * 1000),
        userId: req.user ? req.user.id : undefined,
      });
    }
  });

  next();
}

module.exports = { requestMetrics };
