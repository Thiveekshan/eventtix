'use strict';

const request = require('supertest');
const {
  createTestContext,
  resetDatabase,
  registerAndLogin,
  createAdminAndLogin,
  bearer,
  createEvent,
} = require('../helpers/api');

const { app, db } = createTestContext();
let admin;
let alice;
let bob;

const book = (token, eventId, quantity) =>
  request(app).post('/bookings').set(bearer(token)).send({ eventId, quantity });

const seatsLeft = async (eventId) => (await request(app).get(`/events/${eventId}`)).body.seatsAvailable;

beforeAll(() => db.initSchema());
beforeEach(async () => {
  await resetDatabase(db);
  admin = await createAdminAndLogin(app, db);
  alice = await registerAndLogin(app, 'Alice Example');
  bob = await registerAndLogin(app, 'Bob Example');
});
afterAll(() => db.close());

describe('FR6: booking tickets', () => {
  test('creates a booking, calculates the total and reduces the seats', async () => {
    const event = await createEvent(app, admin.token, { price: 19.99, capacity: 10 });
    const res = await book(alice.token, event.id, 3).expect(201);

    expect(res.body).toEqual({
      id: expect.any(Number),
      userId: alice.user.id,
      eventId: event.id,
      event: { id: event.id, title: event.title, date: event.date, venue: event.venue },
      quantity: 3,
      totalPrice: 59.97,
      status: 'confirmed',
      createdAt: expect.any(String),
    });
    expect(await seatsLeft(event.id)).toBe(7);
  });

  test('requires a login', async () => {
    const event = await createEvent(app, admin.token);
    await request(app).post('/bookings').send({ eventId: event.id, quantity: 1 }).expect(401);
  });

  test('BR1: cannot book more seats than are left, and nothing changes', async () => {
    const event = await createEvent(app, admin.token, { capacity: 4 });
    await book(alice.token, event.id, 3).expect(201);

    const res = await book(bob.token, event.id, 2).expect(409);
    expect(res.body.error).toMatch(/Only 1 seat/);
    expect(await seatsLeft(event.id)).toBe(1);
  });

  test('BR1: a sold-out event says so', async () => {
    const event = await createEvent(app, admin.token, { capacity: 2 });
    await book(alice.token, event.id, 2).expect(201);
    const res = await book(bob.token, event.id, 1).expect(409);
    expect(res.body.error).toMatch(/sold out/);
  });

  test.each([0, 7, -1, 2.5])('BR2: rejects a quantity of %p', async (quantity) => {
    const event = await createEvent(app, admin.token, { capacity: 50 });
    const res = await book(alice.token, event.id, quantity).expect(400);
    expect(res.body.error).toBeDefined();
    expect(await seatsLeft(event.id)).toBe(50);
  });

  test('BR2: exactly 6 tickets is allowed', async () => {
    const event = await createEvent(app, admin.token, { capacity: 50 });
    await book(alice.token, event.id, 6).expect(201);
  });

  test('BR3: cannot book a past event', async () => {
    const past = await createEvent(app, admin.token, { date: '2020-01-01T10:00:00Z' });
    const res = await book(alice.token, past.id, 1).expect(409);
    expect(res.body.error).toMatch(/already taken place/);
    expect(await seatsLeft(past.id)).toBe(10);
  });

  test('returns 404 for an event that does not exist', async () => {
    await book(alice.token, 9999, 1).expect(404);
  });

  test('rejects a missing eventId', async () => {
    await request(app).post('/bookings').set(bearer(alice.token)).send({ quantity: 1 }).expect(400);
  });
});

describe('FR7: viewing bookings', () => {
  test('a user sees only their own bookings, newest first', async () => {
    const event = await createEvent(app, admin.token);
    const first = await book(alice.token, event.id, 1);
    const second = await book(alice.token, event.id, 2);
    await book(bob.token, event.id, 1);

    const res = await request(app).get('/bookings').set(bearer(alice.token)).expect(200);
    expect(res.body.map((b) => b.id)).toEqual([second.body.id, first.body.id]);
    expect(res.body.every((b) => b.userId === alice.user.id)).toBe(true);
  });

  test('BR5: an admin sees all bookings', async () => {
    const event = await createEvent(app, admin.token);
    await book(alice.token, event.id, 1);
    await book(bob.token, event.id, 1);

    const res = await request(app).get('/bookings').set(bearer(admin.token)).expect(200);
    expect(res.body).toHaveLength(2);
  });

  test('requires a login', async () => {
    await request(app).get('/bookings').expect(401);
  });
});

describe('FR8: cancelling bookings', () => {
  test('BR4: cancelling returns the seats to the event', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    const booking = await book(alice.token, event.id, 4);
    expect(await seatsLeft(event.id)).toBe(6);

    const res = await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(alice.token)).expect(200);
    expect(res.body).toMatchObject({ id: booking.body.id, status: 'cancelled', quantity: 4 });
    expect(await seatsLeft(event.id)).toBe(10);
  });

  test('a booking cannot be cancelled twice, so seats are not returned twice', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    const booking = await book(alice.token, event.id, 4);
    await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(alice.token)).expect(200);
    await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(alice.token)).expect(409);
    expect(await seatsLeft(event.id)).toBe(10);
  });

  test('BR5: another user cannot cancel it', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    const booking = await book(alice.token, event.id, 4);

    await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(bob.token)).expect(403);
    expect(await seatsLeft(event.id)).toBe(6);
  });

  test('BR5: an admin can cancel any booking', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    const booking = await book(alice.token, event.id, 4);
    await request(app).delete(`/bookings/${booking.body.id}`).set(bearer(admin.token)).expect(200);
    expect(await seatsLeft(event.id)).toBe(10);
  });

  test('returns 404 for a missing booking and 400 for a malformed id', async () => {
    await request(app).delete('/bookings/9999').set(bearer(alice.token)).expect(404);
    await request(app).delete('/bookings/abc').set(bearer(alice.token)).expect(400);
  });

  test('a cancelled seat can be booked by someone else', async () => {
    const event = await createEvent(app, admin.token, { capacity: 1 });
    const aliceBooking = await book(alice.token, event.id, 1).expect(201);
    await book(bob.token, event.id, 1).expect(409);

    await request(app).delete(`/bookings/${aliceBooking.body.id}`).set(bearer(alice.token)).expect(200);
    await book(bob.token, event.id, 1).expect(201);
  });
});

describe('BR8: the last seat cannot be sold twice', () => {
  test('ten people booking the last seat at the same moment: exactly one succeeds', async () => {
    const event = await createEvent(app, admin.token, { capacity: 1 });
    const buyers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerAndLogin(app, `Buyer ${i}`)),
    );

    const results = await Promise.all(buyers.map((buyer) => book(buyer.token, event.id, 1)));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(await seatsLeft(event.id)).toBe(0);

    const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'confirmed'");
    expect(rows[0].n).toBe(1);
  });

  test('concurrent bookings never oversell: 8 people want 2 seats each from 10 seats', async () => {
    const event = await createEvent(app, admin.token, { capacity: 10 });
    const buyers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => registerAndLogin(app, `Group ${i}`)),
    );

    const results = await Promise.all(buyers.map((buyer) => book(buyer.token, event.id, 2)));
    const successes = results.filter((r) => r.status === 201).length;

    expect(successes).toBe(5);
    expect(await seatsLeft(event.id)).toBe(0);
  });
});

describe('metrics reflect booking activity', () => {
  test('bookings and failures are counted', async () => {
    const event = await createEvent(app, admin.token, { capacity: 1 });
    await book(alice.token, event.id, 1).expect(201);
    await book(bob.token, event.id, 1).expect(409);

    const metrics = (await request(app).get('/metrics')).text;
    const value = (name) => Number(new RegExp(`^${name}(?:\\{[^}]*\\})? (\\d+)`, 'm').exec(metrics)?.[1]);

    expect(value('bookings_created_total')).toBeGreaterThanOrEqual(1);
    expect(metrics).toMatch(/booking_failures_total\{reason="sold_out",app="eventtix-api"\} [1-9]/);
  });
});
