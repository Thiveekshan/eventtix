'use strict';

function toEvent(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    date: new Date(row.event_date).toISOString(),
    price: Number(row.price),
    capacity: row.capacity,
    seatsAvailable: row.seats_available,
  };
}

async function list(q) {
  const result = await q.query('SELECT * FROM events ORDER BY event_date ASC, id ASC');
  return result.rows.map(toEvent);
}

async function count(q) {
  const result = await q.query('SELECT COUNT(*)::int AS total FROM events');
  return result.rows[0].total;
}

async function findById(q, id) {
  const result = await q.query('SELECT * FROM events WHERE id = $1', [id]);
  return toEvent(result.rows[0]);
}

/** Locks the row until the transaction ends, so two requests cannot change the seats at once. */
async function findByIdForUpdate(q, id) {
  const result = await q.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
  return toEvent(result.rows[0]);
}

async function create(q, { title, description, venue, date, price, capacity }) {
  const result = await q.query(
    `INSERT INTO events (title, description, venue, event_date, price, capacity, seats_available)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [title, description, venue, date, price, capacity],
  );
  return toEvent(result.rows[0]);
}

async function update(q, id, { title, description, venue, date, price, capacity }, seatsAvailable) {
  const result = await q.query(
    `UPDATE events
        SET title = $2, description = $3, venue = $4, event_date = $5,
            price = $6, capacity = $7, seats_available = $8
      WHERE id = $1
      RETURNING *`,
    [id, title, description, venue, date, price, capacity, seatsAvailable],
  );
  return toEvent(result.rows[0]);
}

async function adjustSeats(q, id, delta) {
  await q.query('UPDATE events SET seats_available = seats_available + $2 WHERE id = $1', [id, delta]);
}

async function remove(q, id) {
  await q.query('DELETE FROM events WHERE id = $1', [id]);
}

module.exports = { list, count, findById, findByIdForUpdate, create, update, adjustSeats, remove };
