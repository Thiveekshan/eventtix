'use strict';

// Bookings are always returned together with a few event details.
const BOOKING_WITH_EVENT = `
  b.id, b.user_id, b.event_id, b.quantity, b.total_price, b.status, b.created_at,
  e.title AS event_title, e.event_date AS event_date, e.venue AS event_venue
`;

function toBooking(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    event: {
      id: row.event_id,
      title: row.event_title,
      date: new Date(row.event_date).toISOString(),
      venue: row.event_venue,
    },
    quantity: row.quantity,
    totalPrice: Number(row.total_price),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function create(q, { userId, eventId, quantity, totalPrice }) {
  const result = await q.query(
    `WITH b AS (
       INSERT INTO bookings (user_id, event_id, quantity, total_price)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT ${BOOKING_WITH_EVENT} FROM b JOIN events e ON e.id = b.event_id`,
    [userId, eventId, quantity, totalPrice],
  );
  return toBooking(result.rows[0]);
}

/** Locks the booking row (not the event) while it is being cancelled. */
async function findByIdForUpdate(q, id) {
  const result = await q.query(
    `SELECT b.id, b.user_id, b.event_id, b.quantity, b.status
       FROM bookings b
      WHERE b.id = $1
        FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    quantity: row.quantity,
    status: row.status,
  };
}

async function markCancelled(q, id) {
  const result = await q.query(
    `WITH b AS (
       UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *
     )
     SELECT ${BOOKING_WITH_EVENT} FROM b JOIN events e ON e.id = b.event_id`,
    [id],
  );
  return toBooking(result.rows[0]);
}

async function listForUser(q, userId) {
  const result = await q.query(
    `SELECT ${BOOKING_WITH_EVENT}
       FROM bookings b JOIN events e ON e.id = b.event_id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC, b.id DESC`,
    [userId],
  );
  return result.rows.map(toBooking);
}

async function listAll(q) {
  const result = await q.query(
    `SELECT ${BOOKING_WITH_EVENT}
       FROM bookings b JOIN events e ON e.id = b.event_id
      ORDER BY b.created_at DESC, b.id DESC`,
  );
  return result.rows.map(toBooking);
}

async function countConfirmedForEvent(q, eventId) {
  const result = await q.query(
    `SELECT COUNT(*)::int AS total FROM bookings WHERE event_id = $1 AND status = 'confirmed'`,
    [eventId],
  );
  return result.rows[0].total;
}

module.exports = {
  create,
  findByIdForUpdate,
  markCancelled,
  listForUser,
  listAll,
  countConfirmedForEvent,
};
