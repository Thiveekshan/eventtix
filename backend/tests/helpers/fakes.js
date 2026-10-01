'use strict';

/**
 * In-memory stand-ins for the database and repositories, so service logic
 * can be unit tested quickly without a real database.
 */

function createFakeDb() {
  return {
    query: async () => ({ rows: [] }),
    withTransaction: async (work) => work({ query: async () => ({ rows: [] }) }),
    checkConnection: async () => true,
  };
}

function createFakeMetrics() {
  const calls = { created: 0, cancelled: 0, failures: [] };
  return {
    calls,
    bookingsCreated: { inc: () => { calls.created += 1; } },
    bookingsCancelled: { inc: () => { calls.cancelled += 1; } },
    bookingFailures: { inc: (labels) => { calls.failures.push(labels.reason); } },
  };
}

function createFakeEventRepository(events = []) {
  const store = new Map(events.map((event) => [event.id, { ...event }]));
  return {
    store,
    findById: async (q, id) => store.get(id) || null,
    findByIdForUpdate: async (q, id) => store.get(id) || null,
    list: async () => [...store.values()],
    create: async (q, data) => {
      const event = { id: store.size + 1, ...data, seatsAvailable: data.capacity };
      store.set(event.id, event);
      return event;
    },
    update: async (q, id, data, seatsAvailable) => {
      const event = { ...store.get(id), ...data, seatsAvailable };
      store.set(id, event);
      return event;
    },
    adjustSeats: async (q, id, delta) => {
      store.get(id).seatsAvailable += delta;
    },
    remove: async (q, id) => {
      store.delete(id);
    },
  };
}

function createFakeBookingRepository(bookings = []) {
  const store = new Map(bookings.map((booking) => [booking.id, { ...booking }]));
  return {
    store,
    create: async (q, data) => {
      const booking = { id: store.size + 1, ...data, status: 'confirmed' };
      store.set(booking.id, booking);
      return booking;
    },
    findByIdForUpdate: async (q, id) => store.get(id) || null,
    markCancelled: async (q, id) => {
      const booking = { ...store.get(id), status: 'cancelled' };
      store.set(id, booking);
      return booking;
    },
    listForUser: async (q, userId) => [...store.values()].filter((b) => b.userId === userId),
    listAll: async () => [...store.values()],
    countConfirmedForEvent: async (q, eventId) =>
      [...store.values()].filter((b) => b.eventId === eventId && b.status === 'confirmed').length,
  };
}

function createFakeUserRepository(users = []) {
  const store = [...users];
  return {
    store,
    findByEmail: async (q, email) => store.find((user) => user.email === email) || null,
    create: async (q, data) => {
      const user = { id: store.length + 1, ...data };
      store.push(user);
      return user;
    },
  };
}

const IN_ONE_WEEK = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function makeEvent(overrides = {}) {
  return {
    id: 1,
    title: 'Test Event',
    description: '',
    venue: 'Test Hall',
    date: IN_ONE_WEEK,
    price: 10,
    capacity: 10,
    seatsAvailable: 10,
    ...overrides,
  };
}

module.exports = {
  createFakeDb,
  createFakeMetrics,
  createFakeEventRepository,
  createFakeBookingRepository,
  createFakeUserRepository,
  makeEvent,
  IN_ONE_WEEK,
};
