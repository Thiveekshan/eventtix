'use strict';

const { AppError } = require('../utils/httpError');
const { parseId, validateEventInput } = require('../domain/validators');

function createEventService({ db, eventRepository, bookingRepository }) {
  async function list() {
    return eventRepository.list(db);
  }

  async function get(rawId) {
    const event = await eventRepository.findById(db, parseId(rawId));
    if (!event) {
      throw new AppError(404, 'Event not found', 'not_found');
    }
    return event;
  }

  async function create(input) {
    return eventRepository.create(db, validateEventInput(input));
  }

  async function update(rawId, input) {
    const id = parseId(rawId);
    const data = validateEventInput(input);

    return db.withTransaction(async (client) => {
      const existing = await eventRepository.findByIdForUpdate(client, id);
      if (!existing) {
        throw new AppError(404, 'Event not found', 'not_found');
      }

      // Seats already sold stay sold: capacity can grow, but not drop below them.
      const seatsSold = existing.capacity - existing.seatsAvailable;
      if (data.capacity < seatsSold) {
        throw new AppError(
          409,
          `Capacity cannot be lower than the ${seatsSold} seat(s) already booked`,
          'conflict',
        );
      }
      return eventRepository.update(client, id, data, data.capacity - seatsSold);
    });
  }

  async function remove(rawId) {
    const id = parseId(rawId);

    await db.withTransaction(async (client) => {
      const existing = await eventRepository.findByIdForUpdate(client, id);
      if (!existing) {
        throw new AppError(404, 'Event not found', 'not_found');
      }
      // BR7: an event with active bookings cannot be deleted.
      if ((await bookingRepository.countConfirmedForEvent(client, id)) > 0) {
        throw new AppError(409, 'Cannot delete an event that has active bookings', 'conflict');
      }
      await eventRepository.remove(client, id);
    });
  }

  return { list, get, create, update, remove };
}

module.exports = { createEventService };
