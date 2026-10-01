'use strict';

const { Router } = require('express');

const config = require('../config');
const metrics = require('../metrics');

function systemRoutes({ db }) {
  const router = Router();

  // Used by Docker health checks, the pipeline's smoke test and the web footer.
  router.get('/health', async (req, res) => {
    const databaseUp = await db.checkConnection();
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'ok' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Proves which release is running (staging and production report different builds).
  router.get('/version', (req, res) => {
    res.json({
      version: config.version,
      build: config.build,
      commit: config.commit,
      environment: config.appEnvironment,
    });
  });

  // Scraped by Prometheus.
  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  return router;
}

module.exports = { systemRoutes };
