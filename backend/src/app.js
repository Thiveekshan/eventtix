'use strict';

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');

const config = require('./config');
const { createAuthMiddleware } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { requestMetrics } = require('./middleware/requestMetrics');
const { authRoutes } = require('./routes/auth');
const { bookingRoutes } = require('./routes/bookings');
const { eventRoutes } = require('./routes/events');
const { systemRoutes } = require('./routes/system');

/** Builds the Express app from its services (passed in so tests can build it too). */
function createApp(services) {
  const auth = createAuthMiddleware(services.authService);
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(requestMetrics);

  app.use('/', systemRoutes(services));
  app.use('/auth', authRoutes(services));
  app.use('/events', eventRoutes({ ...services, auth }));
  app.use('/bookings', bookingRoutes({ ...services, auth }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
