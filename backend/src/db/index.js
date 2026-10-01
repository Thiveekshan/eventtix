'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const config = require('../config');
const logger = require('../logger');

const SCHEMA_LOCK_ID = 727274;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX) || 10,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `work(client)` inside a database transaction.
 * Commits if it resolves, rolls back if it throws.
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Rollback failed', { error: rollbackErr.message });
    }
    throw err;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/** Creates the tables if they do not exist. An advisory lock stops two instances racing. */
async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_ID]);
    await client.query(sql);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

/** Waits for the database to accept connections (it may start after the API). */
async function waitForConnection(attempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await checkConnection()) {
      return;
    }
    logger.warn('Waiting for the database', { attempt, attempts });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Database is not reachable');
}

function close() {
  return pool.end();
}

module.exports = { query, withTransaction, checkConnection, initSchema, waitForConnection, close };
