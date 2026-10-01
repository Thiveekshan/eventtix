'use strict';

const config = require('./config');
const db = require('./db');
const metrics = require('./metrics');
const bookingRepository = require('./repositories/bookingRepository');
const eventRepository = require('./repositories/eventRepository');
const userRepository = require('./repositories/userRepository');
const { createAuthService } = require('./services/authService');
const { createBookingService } = require('./services/bookingService');
const { createEventService } = require('./services/eventService');

/** Wires the real database, repositories and services together. */
function buildServices() {
  return {
    db,
    authService: createAuthService({ db, userRepository, config }),
    eventService: createEventService({ db, eventRepository, bookingRepository }),
    bookingService: createBookingService({ db, eventRepository, bookingRepository, metrics }),
  };
}

module.exports = { buildServices };
