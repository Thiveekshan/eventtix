'use strict';

const request = require('supertest');
const { createTestContext, resetDatabase } = require('../helpers/api');

const { app, db } = createTestContext();

beforeAll(async () => {
  await db.initSchema();
  await resetDatabase(db);
});

afterAll(() => db.close());

describe('system endpoints', () => {
  test('FR9: GET /health reports the app and database are up', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  test('FR9: GET /health returns 503 when the database is down', async () => {
    const original = db.checkConnection;
    db.checkConnection = async () => false;
    try {
      const res = await request(app).get('/health').expect(503);
      expect(res.body).toMatchObject({ status: 'degraded', database: 'down' });
    } finally {
      db.checkConnection = original;
    }
  });

  test('FR11: GET /version reports the release', async () => {
    const res = await request(app).get('/version').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        build: expect.any(String),
        commit: expect.any(String),
        environment: expect.any(String),
      }),
    );
  });

  test('FR10: GET /metrics exposes Prometheus metrics, including the custom ones', async () => {
    const res = await request(app).get('/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('bookings_created_total');
    expect(res.text).toContain('booking_failures_total{reason="sold_out"');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });

  test('eventtix_database_up is 1 while the database is reachable', async () => {
    const res = await request(app).get('/metrics').expect(200);
    expect(res.text).toMatch(/^eventtix_database_up\{[^}]*\} 1$/m);
  });

  test('eventtix_database_up drops to 0 when the database cannot be reached (this is what the alert watches)', async () => {
    const original = db.checkConnection;
    db.checkConnection = async () => false;
    try {
      const res = await request(app).get('/metrics').expect(200);
      expect(res.text).toMatch(/^eventtix_database_up\{[^}]*\} 0$/m);
    } finally {
      db.checkConnection = original;
    }
  });

  test('a database check that hangs is reported as down instead of hanging the scrape', async () => {
    const original = db.checkConnection;
    db.checkConnection = () => new Promise(() => {});   // never answers
    try {
      const started = Date.now();
      const res = await request(app).get('/metrics').expect(200);
      expect(res.text).toMatch(/^eventtix_database_up\{[^}]*\} 0$/m);
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      db.checkConnection = original;
    }
  });

  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/nope').expect(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('malformed JSON returns 400, not a crash', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(res.body.error).toMatch(/not valid JSON/);
  });

  test('an oversized body is rejected with 413', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(200000) });
    expect(res.status).toBe(413);
  });

  test('security headers are set and the framework is not advertised', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('unexpected errors return a generic 500 without leaking details', async () => {
    const original = db.checkConnection;
    db.checkConnection = async () => {
      throw new Error('secret internal detail');
    };
    try {
      const res = await request(app).get('/health').expect(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(JSON.stringify(res.body)).not.toContain('secret');
    } finally {
      db.checkConnection = original;
    }
  });
});
