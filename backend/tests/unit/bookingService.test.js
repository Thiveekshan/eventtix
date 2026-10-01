'use strict';

const { createBookingService } = require('../../src/services/bookingService');
const {
  createFakeDb,
  createFakeMetrics,
  createFakeEventRepository,
  createFakeBookingRepository,
  makeEvent,
} = require('../helpers/fakes');

const user = { id: 1, role: 'user' };
const otherUser = { id: 2, role: 'user' };
const admin = { id: 9, role: 'admin' };

function setup({ events = [makeEvent()], bookings = [], now = new Date() } = {}) {
  const eventRepository = createFakeEventRepository(events);
  const bookingRepository = createFakeBookingRepository(bookings);
  const metrics = createFakeMetrics();
  const service = createBookingService({
    db: createFakeDb(),
    eventRepository,
    bookingRepository,
    metrics,
    clock: () => now,
  });
  return { service, eventRepository, bookingRepository, metrics };
}

describe('bookingService', () => {
  describe('createBooking', () => {
    test('books seats, reduces availability and counts the booking', async () => {
      const { service, eventRepository, metrics } = setup();
      const booking = await service.createBooking(user, { eventId: 1, quantity: 3 });

      expect(booking).toMatchObject({ userId: 1, eventId: 1, quantity: 3, totalPrice: 30, status: 'confirmed' });
      expect(eventRepository.store.get(1).seatsAvailable).toBe(7);
      expect(metrics.calls.created).toBe(1);
      expect(metrics.calls.failures).toEqual([]);
    });

    test('BR1: refuses more seats than are left', async () => {
      const { service, eventRepository, metrics } = setup({ events: [makeEvent({ seatsAvailable: 2 })] });
      await expect(service.createBooking(user, { eventId: 1, quantity: 3 })).rejects.toMatchObject({ status: 409 });
      expect(eventRepository.store.get(1).seatsAvailable).toBe(2);
      expect(metrics.calls.failures).toEqual(['not_enough_seats']);
    });

    test('reports a sold-out event', async () => {
      const { service, metrics } = setup({ events: [makeEvent({ seatsAvailable: 0 })] });
      await expect(service.createBooking(user, { eventId: 1, quantity: 1 })).rejects.toThrow(/sold out/);
      expect(metrics.calls.failures).toEqual(['sold_out']);
    });

    test('BR2: refuses more than 6 tickets', async () => {
      const { service, metrics } = setup();
      await expect(service.createBooking(user, { eventId: 1, quantity: 7 })).rejects.toMatchObject({ status: 400 });
      expect(metrics.calls.failures).toEqual(['validation']);
    });

    test('BR3: refuses a past event', async () => {
      const { service, metrics } = setup({ events: [makeEvent({ date: '2020-01-01T00:00:00Z' })] });
      await expect(service.createBooking(user, { eventId: 1, quantity: 1 })).rejects.toThrow(/already taken place/);
      expect(metrics.calls.failures).toEqual(['past_event']);
    });

    test('returns 404 for an unknown event', async () => {
      const { service, metrics } = setup();
      await expect(service.createBooking(user, { eventId: 99, quantity: 1 })).rejects.toMatchObject({ status: 404 });
      expect(metrics.calls.failures).toEqual(['not_found']);
    });

    test('rejects invalid input before touching the database', async () => {
      const { service } = setup();
      await expect(service.createBooking(user, { quantity: 1 })).rejects.toMatchObject({ status: 400 });
    });

    test('counts unexpected errors as server errors and rethrows them', async () => {
      const { service, eventRepository, metrics } = setup();
      eventRepository.findByIdForUpdate = async () => {
        throw new Error('database exploded');
      };
      await expect(service.createBooking(user, { eventId: 1, quantity: 1 })).rejects.toThrow('database exploded');
      expect(metrics.calls.failures).toEqual(['server_error']);
    });
  });

  describe('listBookings', () => {
    const bookings = [
      { id: 1, userId: 1, eventId: 1, quantity: 1, status: 'confirmed' },
      { id: 2, userId: 2, eventId: 1, quantity: 1, status: 'confirmed' },
    ];

    test('a user sees only their own bookings', async () => {
      const { service } = setup({ bookings });
      expect((await service.listBookings(user)).map((b) => b.id)).toEqual([1]);
    });

    test('an admin sees every booking', async () => {
      const { service } = setup({ bookings });
      expect((await service.listBookings(admin)).map((b) => b.id)).toEqual([1, 2]);
    });
  });

  describe('cancelBooking', () => {
    const booking = { id: 1, userId: 1, eventId: 1, quantity: 4, status: 'confirmed' };
    const seatsAfterBooking = { seatsAvailable: 6 };

    test('BR4: returns the seats to the event', async () => {
      const { service, eventRepository, metrics } = setup({
        events: [makeEvent(seatsAfterBooking)],
        bookings: [booking],
      });
      const result = await service.cancelBooking(user, 1);

      expect(result.status).toBe('cancelled');
      expect(eventRepository.store.get(1).seatsAvailable).toBe(10);
      expect(metrics.calls.cancelled).toBe(1);
    });

    test('BR5: another user cannot cancel it', async () => {
      const { service, eventRepository } = setup({ events: [makeEvent(seatsAfterBooking)], bookings: [booking] });
      await expect(service.cancelBooking(otherUser, 1)).rejects.toMatchObject({ status: 403 });
      expect(eventRepository.store.get(1).seatsAvailable).toBe(6);
    });

    test('BR5: an admin can cancel any booking', async () => {
      const { service } = setup({ events: [makeEvent(seatsAfterBooking)], bookings: [booking] });
      await expect(service.cancelBooking(admin, 1)).resolves.toMatchObject({ status: 'cancelled' });
    });

    test('cannot be cancelled twice, so seats are never returned twice', async () => {
      const { service, eventRepository } = setup({
        events: [makeEvent(seatsAfterBooking)],
        bookings: [{ ...booking, status: 'cancelled' }],
      });
      await expect(service.cancelBooking(user, 1)).rejects.toMatchObject({ status: 409 });
      expect(eventRepository.store.get(1).seatsAvailable).toBe(6);
    });

    test('returns 404 for an unknown booking', async () => {
      const { service } = setup();
      await expect(service.cancelBooking(user, 42)).rejects.toMatchObject({ status: 404 });
    });

    test('rejects a malformed id', async () => {
      const { service } = setup();
      await expect(service.cancelBooking(user, 'abc')).rejects.toMatchObject({ status: 400 });
    });
  });
});
