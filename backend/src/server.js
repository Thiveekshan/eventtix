'use strict';

const { createApp } = require('./app');
const config = require('./config');
const { buildServices } = require('./container');
const db = require('./db');
const logger = require('./logger');
const { seed } = require('./seed');

async function main() {
  await db.waitForConnection();
  await db.initSchema();
  await seed();

  const app = createApp(buildServices());
  const server = app.listen(config.port, () => {
    logger.info('EventTix API listening', {
      port: config.port,
      version: config.version,
      build: config.build,
      environment: config.appEnvironment,
    });
  });

  // Docker sends SIGTERM when stopping a container: finish current requests, then exit.
  const shutdown = (signal) => {
    logger.info('Shutting down', { signal });
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
