'use strict';

const { createEventService } = require('../../src/services/eventService');
const {
  createFakeDb,
  createFakeEventRepository,
  createFakeBookingRepository,
  makeEvent,
} = require('../helpers/fakes');

const input = {
  title: 'Updated',
  description: '',
  venue: 'Hall',
  date: '2031-01-01T10:00:00Z',
  price: 20,
  capacity: 50,
};

function setup({ events = [makeEvent()], bookings = [] } = {}) {
  const eventRepository = createFakeEventRepository(events);
  const bookingRepository = createFakeBookingRepository(bookings);
  const service = createEventService({ db: createFakeDb(), eventRepository, bookingRepository });
  return { service, eventRepository };
}

describe('eventService', () => {
  test('creates an event with every seat available', async () => {
    const { service } = setup({ events: [] });
    const event = await service.create(input);
    expect(event).toMatchObject({ title: 'Updated', capacity: 50, seatsAvailable: 50 });
  });

  test('rejects invalid event data', async () => {
    const { service } = setup({ events: [] });
    await expect(service.create({ ...input, capacity: 0 })).rejects.toMatchObject({ status: 400 });
  });

  test('lists and gets events, with 404 for a missing one', async () => {
    const { service } = setup();
    expect(await service.list()).toHaveLength(1);
    expect((await service.get('1')).id).toBe(1);
    await expect(service.get('99')).rejects.toMatchObject({ status: 404 });
  });

  describe('update', () => {
    test('keeps seats that are already sold', async () => {
      // capacity 10, 4 sold. Raising capacity to 50 leaves 46 available.
      const { service } = setup({ events: [makeEvent({ seatsAvailable: 6 })] });
      const updated = await service.update('1', input);
      expect(updated.seatsAvailable).toBe(46);
    });

    test('refuses a capacity lower than the seats already sold', async () => {
      const { service } = setup({ events: [makeEvent({ seatsAvailable: 6 })] });
      await expect(service.update('1', { ...input, capacity: 3 })).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/4 seat/),
      });
    });

    test('returns 404 for a missing event', async () => {
      const { service } = setup();
      await expect(service.update('99', input)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('remove', () => {
    test('deletes an event with no bookings', async () => {
      const { service, eventRepository } = setup();
      await service.remove('1');
      expect(eventRepository.store.size).toBe(0);
    });

    test('BR7: refuses to delete an event with active bookings', async () => {
      const bookings = [{ id: 1, userId: 1, eventId: 1, quantity: 1, status: 'confirmed' }];
      const { service, eventRepository } = setup({ bookings });
      await expect(service.remove('1')).rejects.toMatchObject({ status: 409 });
      expect(eventRepository.store.size).toBe(1);
    });

    test('allows deleting an event whose bookings were all cancelled', async () => {
      const bookings = [{ id: 1, userId: 1, eventId: 1, quantity: 1, status: 'cancelled' }];
      const { service } = setup({ bookings });
      await expect(service.remove('1')).resolves.toBeUndefined();
    });

    test('returns 404 for a missing event', async () => {
      const { service } = setup();
      await expect(service.remove('99')).rejects.toMatchObject({ status: 404 });
    });
  });
});
