'use strict';

const { AppError } = require('../utils/httpError');

const MAX_TICKETS_PER_BOOKING = 6;

/** BR2: between 1 and 6 tickets per booking. */
function assertQuantityAllowed(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new AppError(
      400,
      `You can book between 1 and ${MAX_TICKETS_PER_BOOKING} tickets at a time`,
      'validation',
    );
  }
}

/** BR3: past events cannot be booked. */
function assertEventNotPast(event, now = new Date()) {
  if (new Date(event.date).getTime() <= now.getTime()) {
    throw new AppError(409, 'This event has already taken place', 'past_event');
  }
}

/** BR1: a booking cannot exceed the seats still available. */
function assertSeatsAvailable(event, quantity) {
  if (event.seatsAvailable <= 0) {
    throw new AppError(409, 'This event is sold out', 'sold_out');
  }
  if (quantity > event.seatsAvailable) {
    throw new AppError(409, `Only ${event.seatsAvailable} seat(s) left for this event`, 'not_enough_seats');
  }
}

/** Total in whole cents, so 3 x 19.99 is exactly 59.97 and never 59.970000000000006. */
function calculateTotal(price, quantity) {
  const cents = Math.round(price * 100) * quantity;
  return cents / 100;
}

/** BR5: a user can only see or cancel their own bookings. Admins can access all. */
function canAccessBooking(user, booking) {
  return user.role === 'admin' || booking.userId === user.id;
}

module.exports = {
  MAX_TICKETS_PER_BOOKING,
  assertQuantityAllowed,
  assertEventNotPast,
  assertSeatsAvailable,
  calculateTotal,
  canAccessBooking,
};
