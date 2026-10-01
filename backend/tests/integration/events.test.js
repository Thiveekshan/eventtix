'use strict';

const request = require('supertest');
const {
  createTestContext,
  resetDatabase,
  registerAndLogin,
  createAdminAndLogin,
  bearer,
  eventPayload,
  createEvent,
} = require('../helpers/api');

const { app, db } = createTestContext();
let admin;
let user;

beforeAll(() => db.initSchema());
beforeEach(async () => {
  await resetDatabase(db);
  admin = await createAdminAndLogin(app, db);
  user = await registerAndLogin(app, 'Regular User');
});
afterAll(() => db.close());

describe('reading events', () => {
  test('FR4: anyone can list events, soonest first', async () => {
    const later = await createEvent(app, admin.token, { title: 'Later', date: '2031-06-01T10:00:00Z' });
    const sooner = await createEvent(app, admin.token, { title: 'Sooner', date: '2031-05-01T10:00:00Z' });

    const res = await request(app).get('/events').expect(200);
    expect(res.body.map((e) => e.id)).toEqual([sooner.id, later.id]);
  });

  test('returns an empty list when there are no events', async () => {
    const res = await request(app).get('/events').expect(200);
    expect(res.body).toEqual([]);
  });

  test('FR4: anyone can view one event, in the shape the web app expects', async () => {
    const event = await createEvent(app, admin.token);
    const res = await request(app).get(`/events/${event.id}`).expect(200);
    expect(res.body).toEqual({
      id: event.id,
      title: 'Integration Test Concert',
      description: 'Created by a test',
      venue: 'Test Arena',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      price: 25.5,
      capacity: 10,
      seatsAvailable: 10,
    });
  });

  test('returns 404 for a missing event and 400 for a malformed id', async () => {
    await request(app).get('/events/9999').expect(404);
    await request(app).get('/events/abc').expect(400);
  });
});

describe('FR5 / BR6: managing events is admin only', () => {
  test('an admin can create an event', async () => {
    const res = await request(app).post('/events').set(bearer(admin.token)).send(eventPayload()).expect(201);
    expect(res.body).toMatchObject({ capacity: 10, seatsAvailable: 10, price: 25.5 });
  });

  test('a visitor gets 401 and a normal user gets 403', async () => {
    await request(app).post('/events').send(eventPayload()).expect(401);
    await request(app).post('/events').set(bearer(user.token)).send(eventPayload()).expect(403);
    await request(app).put('/events/1').set(bearer(user.token)).send(eventPayload()).expect(403);
    await request(app).delete('/events/1').set(bearer(user.token)).expect(403);
  });

  test('a forged or garbage token is rejected', async () => {
    await request(app).post('/events').set(bearer('garbage')).send(eventPayload()).expect(401);
  });

  test.each([
    [{ title: '' }],
    [{ price: -5 }],
    [{ capacity: 0 }],
    [{ date: 'tomorrow-ish' }],
  ])('rejects invalid event data %j', async (override) => {
    await request(app).post('/events').set(bearer(admin.token)).send(eventPayload(override)).expect(400);
  });

  test('an admin can update an event', async () => {
    const event = await createEvent(app, admin.token);
    const res = await request(app)
      .put(`/events/${event.id}`)
      .set(bearer(admin.token))
      .send(eventPayload({ title: 'Renamed', price: 30, capacity: 20 }))
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Renamed', price: 30, capacity: 20, seatsAvailable: 20 });
  });

  test('updating a missing event returns 404', async () => {
    await request(app).put('/events/9999').set(bearer(admin.token)).send(eventPayload()).expect(404);
  });

  test('an admin can delete an event that has no bookings', async () => {
    const event = await createEvent(app, admin.token);
    await request(app).delete(`/events/${event.id}`).set(bearer(admin.token)).expect(204);
    await request(app).get(`/events/${event.id}`).expect(404);
  });

  test('deleting a missing event returns 404', async () => {
    await request(app).delete('/events/9999').set(bearer(admin.token)).expect(404);
  });
});

describe('events with bookings', () => {
  test('BR7: an event with active bookings cannot be deleted', async () => {
    const event = await createEvent(app, admin.token);
    await request(app).post('/bookings').set(bearer(user.token)).send({ eventId: event.id, quantity: 2 }).expect(201);

    const res = await request(app).delete(`/events/${event.id}`).set(bearer(admin.token)).expect(409);
    expect(res.body.error).toMatch(/active bookings/);
    await request(app).get(`/events/${event.id}`).expect(200);
  });

  test('BR7: once every booking is cancelled the event can be deleted', async () => {
    const event = await createEvent(app, admin.token);
    const booking = await request(app).post('/bookings').set(bearer(user.token)).send({ eventId: event.id, quantity: 2 });
    await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(user.token)).expect(200);

    await request(app).delete(`/events/${event.id}`).set(bearer(admin.token)).expect(204);
  });

  test('capacity cannot be lowered below the seats already sold', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    await request(app).post('/bookings').set(bearer(user.token)).send({ eventId: event.id, quantity: 4 }).expect(201);

    const tooLow = await request(app)
      .put(`/events/${event.id}`)
      .set(bearer(admin.token))
      .send(eventPayload({ capacity: 3 }))
      .expect(409);
    expect(tooLow.body.error).toMatch(/4 seat/);

    // Raising it works and keeps the 4 sold seats: 20 - 4 = 16 left.
    const raised = await request(app)
      .put(`/events/${event.id}`)
      .set(bearer(admin.token))
      .send(eventPayload({ capacity: 20 }))
      .expect(200);
    expect(raised.body.seatsAvailable).toBe(16);
  });
});
