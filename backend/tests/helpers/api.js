'use strict';

const request = require('supertest');

const { createApp } = require('../../src/app');
const { buildServices } = require('../../src/container');
const userRepository = require('../../src/repositories/userRepository');
const bcrypt = require('bcryptjs');

const PASSWORD = 'correct-horse-battery';

function createTestContext() {
  const services = buildServices();
  const app = createApp(services);
  return { services, app, db: services.db };
}

async function resetDatabase(db) {
  await db.query('TRUNCATE bookings, events, users RESTART IDENTITY CASCADE');
}

async function registerAndLogin(app, name = 'Test User', email) {
  const address = email || `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
  await request(app).post('/auth/register').send({ name, email: address, password: PASSWORD }).expect(201);
  const res = await request(app).post('/auth/login').send({ email: address, password: PASSWORD }).expect(200);
  return { token: res.body.token, user: res.body.user };
}

/** Admins cannot be created through the API (by design), so insert one directly. */
async function createAdminAndLogin(app, db) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await userRepository.create(db, {
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash,
    role: 'admin',
  });
  const res = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@example.com', password: PASSWORD })
    .expect(200);
  return { token: res.body.token, user: res.body.user };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

function eventPayload(overrides = {}) {
  return {
    title: 'Integration Test Concert',
    description: 'Created by a test',
    venue: 'Test Arena',
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    price: 25.5,
    capacity: 10,
    ...overrides,
  };
}

async function createEvent(app, adminToken, overrides) {
  const res = await request(app).post('/events').set(bearer(adminToken)).send(eventPayload(overrides)).expect(201);
  return res.body;
}

module.exports = {
  PASSWORD,
  createTestContext,
  resetDatabase,
  registerAndLogin,
  createAdminAndLogin,
  bearer,
  eventPayload,
  createEvent,
};
