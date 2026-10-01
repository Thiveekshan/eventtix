'use strict';

// Every function takes `q`: anything with a query(text, params) method,
// either the connection pool or a transaction client.

function toUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

async function findByEmail(q, email) {
  const result = await q.query('SELECT * FROM users WHERE email = $1', [email]);
  return toUser(result.rows[0]);
}

async function create(q, { name, email, passwordHash, role }) {
  const result = await q.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, email, passwordHash, role],
  );
  return toUser(result.rows[0]);
}

module.exports = { findByEmail, create };
