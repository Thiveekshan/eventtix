'use strict';

const bcrypt = require('bcryptjs');

const config = require('./config');
const db = require('./db');
const logger = require('./logger');
const eventRepository = require('./repositories/eventRepository');
const userRepository = require('./repositories/userRepository');

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days, hour) {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const DEMO_EVENTS = [
  { title: 'Summer Music Festival', description: 'Two stages, ten bands and food trucks.', venue: 'Riverside Park', days: 30, hour: 12, price: 89.5, capacity: 200 },
  { title: 'DevOps in Practice', description: 'Talks on CI/CD pipelines, containers and monitoring.', venue: 'City Convention Centre', days: 14, hour: 9, price: 45, capacity: 80 },
  { title: 'Jazz Night', description: 'Live jazz quartet with dinner service.', venue: 'The Blue Room', days: 7, hour: 19, price: 35, capacity: 40 },
  { title: 'Startup Pitch Evening', description: 'Ten founders pitch to a panel of investors.', venue: 'Innovation Hub', days: 21, hour: 18, price: 15, capacity: 120 },
  { title: 'Photography Workshop', description: 'Hands-on portrait and landscape photography.', venue: 'Studio 5', days: 45, hour: 10, price: 120, capacity: 3 },
];

/** Creates the first admin account and optional demo events when configured. */
async function seed() {
  if (config.adminEmail && config.adminPassword) {
    const email = config.adminEmail.toLowerCase();
    if (!(await userRepository.findByEmail(db, email))) {
      const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
      await userRepository.create(db, { name: config.adminName, email, passwordHash, role: 'admin' });
      logger.info('Created admin account', { email });
    }
  }

  if (config.seedDemoData && (await eventRepository.count(db)) === 0) {
    for (const demo of DEMO_EVENTS) {
      await eventRepository.create(db, {
        title: demo.title,
        description: demo.description,
        venue: demo.venue,
        date: daysFromNow(demo.days, demo.hour),
        price: demo.price,
        capacity: demo.capacity,
      });
    }
    logger.info('Created demo events', { count: DEMO_EVENTS.length });
  }
}

module.exports = { seed };
