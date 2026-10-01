'use strict';

const request = require('supertest');
const { createTestContext, resetDatabase, PASSWORD } = require('../helpers/api');

const { app, db } = createTestContext();

beforeAll(() => db.initSchema());
beforeEach(() => resetDatabase(db));
afterAll(() => db.close());

const newUser = { name: 'Ann Smith', email: 'ann@example.com', password: PASSWORD };

describe('POST /auth/register', () => {
  test('FR1: creates an account and returns it without the password', async () => {
    const res = await request(app).post('/auth/register').send(newUser).expect(201);
    expect(res.body).toEqual({ user: { id: expect.any(Number), name: 'Ann Smith', email: 'ann@example.com', role: 'user' } });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  test('FR3: the password is stored as a hash in the database', async () => {
    await request(app).post('/auth/register').send(newUser).expect(201);
    const { rows } = await db.query('SELECT password_hash FROM users');
    expect(rows[0].password_hash).not.toBe(PASSWORD);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  test('a client cannot make themselves an admin', async () => {
    const res = await request(app).post('/auth/register').send({ ...newUser, role: 'admin' }).expect(201);
    expect(res.body.user.role).toBe('user');
  });

  test('rejects a duplicate email, ignoring letter case', async () => {
    await request(app).post('/auth/register').send(newUser).expect(201);
    const res = await request(app).post('/auth/register').send({ ...newUser, email: 'ANN@example.com' }).expect(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  test.each([
    [{ ...newUser, email: 'not-an-email' }, /valid email/],
    [{ ...newUser, password: 'short' }, /between 8 and 72/],
    [{ ...newUser, name: '' }, /name is required/],
    [{}, /name is required/],
  ])('rejects invalid input %j', async (body, message) => {
    const res = await request(app).post('/auth/register').send(body).expect(400);
    expect(res.body.error).toMatch(message);
  });

  test('SQL injection text in a field is stored as plain data and does no harm', async () => {
    const name = "Robert'); DROP TABLE users;--";
    const res = await request(app).post('/auth/register').send({ ...newUser, name }).expect(201);
    expect(res.body.user.name).toBe(name);
    const { rows } = await db.query('SELECT name FROM users');
    expect(rows).toEqual([{ name }]);
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => request(app).post('/auth/register').send(newUser).expect(201));

  test('FR2: returns a token and the user', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'ann@example.com', password: PASSWORD }).expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'ann@example.com', role: 'user' });
  });

  test('accepts the email in any letter case', async () => {
    await request(app).post('/auth/login').send({ email: 'ANN@Example.COM', password: PASSWORD }).expect(200);
  });

  test('rejects a wrong password and an unknown email identically', async () => {
    const wrong = await request(app).post('/auth/login').send({ email: 'ann@example.com', password: 'wrong-password' }).expect(401);
    const unknown = await request(app).post('/auth/login').send({ email: 'who@example.com', password: PASSWORD }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('rejects a missing password', async () => {
    await request(app).post('/auth/login').send({ email: 'ann@example.com' }).expect(400);
  });
});
