'use strict';

const { AppError } = require('../utils/httpError');
const { parseId, validateBookingInput } = require('../domain/validators');
const rules = require('../domain/bookingRules');

function createBookingService({ db, eventRepository, bookingRepository, metrics, clock = () => new Date() }) {
  async function createBooking(user, input) {
    try {
      const { eventId, quantity } = validateBookingInput(input);
      rules.assertQuantityAllowed(quantity);

      const booking = await db.withTransaction(async (client) => {
        // BR8: lock the event row. If two people want the last seat at the same moment,
        // the second request waits here and then sees there are no seats left.
        const event = await eventRepository.findByIdForUpdate(client, eventId);
        if (!event) {
          throw new AppError(404, 'Event not found', 'not_found');
        }
        rules.assertEventNotPast(event, clock());
        rules.assertSeatsAvailable(event, quantity);

        await eventRepository.adjustSeats(client, eventId, -quantity);
        return bookingRepository.create(client, {
          userId: user.id,
          eventId,
          quantity,
          totalPrice: rules.calculateTotal(event.price, quantity),
        });
      });

      metrics.bookingsCreated.inc();
      return booking;
    } catch (err) {
      metrics.bookingFailures.inc({ reason: err.reason || 'server_error' });
      throw err;
    }
  }

  async function listBookings(user) {
    return user.role === 'admin'
      ? bookingRepository.listAll(db)
      : bookingRepository.listForUser(db, user.id);
  }

  async function cancelBooking(user, rawId) {
    const id = parseId(rawId);

    const cancelled = await db.withTransaction(async (client) => {
      const booking = await bookingRepository.findByIdForUpdate(client, id);
      if (!booking) {
        throw new AppError(404, 'Booking not found', 'not_found');
      }
      if (!rules.canAccessBooking(user, booking)) {
        throw new AppError(403, 'You can only cancel your own bookings', 'forbidden');
      }
      if (booking.status === 'cancelled') {
        throw new AppError(409, 'This booking is already cancelled', 'conflict');
      }

      // BR4: cancelling returns the seats to the event.
      await eventRepository.findByIdForUpdate(client, booking.eventId);
      await eventRepository.adjustSeats(client, booking.eventId, booking.quantity);
      return bookingRepository.markCancelled(client, id);
    });

    metrics.bookingsCancelled.inc();
    return cancelled;
  }

  return { createBooking, listBookings, cancelBooking };
}

module.exports = { createBookingService };
