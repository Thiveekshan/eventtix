'use strict';

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'eventtix-api' });

// CPU, memory, event loop lag, garbage collection, etc.
client.collectDefaultMetrics({ register });

const bookingsCreated = new client.Counter({
  name: 'bookings_created_total',
  help: 'Number of bookings successfully created',
  registers: [register],
});

const bookingsCancelled = new client.Counter({
  name: 'bookings_cancelled_total',
  help: 'Number of bookings cancelled',
  registers: [register],
});

const BOOKING_FAILURE_REASONS = [
  'validation',
  'not_found',
  'sold_out',
  'not_enough_seats',
  'past_event',
  'server_error',
];

const bookingFailures = new client.Counter({
  name: 'booking_failures_total',
  help: 'Number of failed booking attempts, by reason',
  labelNames: ['reason'],
  registers: [register],
});

// Export every reason at 0 so dashboards and alert rules see the series from the start.
BOOKING_FAILURE_REASONS.forEach((reason) => bookingFailures.inc({ reason }, 0));

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

module.exports = {
  register,
  bookingsCreated,
  bookingsCancelled,
  bookingFailures,
  httpRequestDuration,
};
