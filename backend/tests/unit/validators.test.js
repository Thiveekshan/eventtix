'use strict';

const v = require('../../src/domain/validators');

const validEvent = {
  title: '  Jazz Night ',
  description: 'Live music',
  venue: 'The Blue Room',
  date: '2030-01-01T19:00:00Z',
  price: 35,
  capacity: 40,
};

describe('validators', () => {
  describe('parseId', () => {
    test.each(['1', 42, '2147483647'])('accepts %p', (value) => {
      expect(v.parseId(value)).toBe(Number(value));
    });

    test.each(['0', '-1', 'abc', '1.5', '', '2147483648', '1; DROP TABLE users'])('rejects %p', (value) => {
      expect(() => v.parseId(value)).toThrow('Invalid id');
    });
  });

  describe('isValidEmail', () => {
    test.each(['a@b.co', 'first.last@example.com.au'])('accepts %s', (email) => {
      expect(v.isValidEmail(email)).toBe(true);
    });

    test.each(['', 'plain', 'a@b', '@b.com', 'a@@b.com', 'a b@c.com', 'a@.com', 'a@b.', 'a@b..com'])(
      'rejects %p',
      (email) => {
        expect(v.isValidEmail(email)).toBe(false);
      },
    );
  });

  describe('validateRegisterInput', () => {
    test('cleans up valid input', () => {
      expect(v.validateRegisterInput({ name: ' Ann ', email: 'ANN@Example.com', password: 'longenough' })).toEqual({
        name: 'Ann',
        email: 'ann@example.com',
        password: 'longenough',
      });
    });

    test.each([
      [undefined, /JSON object/],
      [[], /JSON object/],
      [{ email: 'a@b.co', password: 'longenough' }, /name is required/],
      [{ name: 'A', email: 'nope', password: 'longenough' }, /valid email/],
      [{ name: 'A', email: 'a@b.co', password: 'short' }, /between 8 and 72/],
      [{ name: 'A', email: 'a@b.co', password: 'x'.repeat(73) }, /between 8 and 72/],
      [{ name: 'A'.repeat(101), email: 'a@b.co', password: 'longenough' }, /at most 100/],
    ])('rejects %j', (body, message) => {
      expect(() => v.validateRegisterInput(body)).toThrow(message);
    });
  });

  describe('validateLoginInput', () => {
    test('accepts email and password', () => {
      expect(v.validateLoginInput({ email: 'A@B.co', password: 'x' })).toEqual({ email: 'a@b.co', password: 'x' });
    });

    test('requires a password', () => {
      expect(() => v.validateLoginInput({ email: 'a@b.co', password: '' })).toThrow(/password is required/);
    });
  });

  describe('validateEventInput', () => {
    test('accepts a valid event and normalises the date', () => {
      const result = v.validateEventInput(validEvent);
      expect(result.title).toBe('Jazz Night');
      expect(result.date).toBe('2030-01-01T19:00:00.000Z');
      expect(result.capacity).toBe(40);
    });

    test('description is optional', () => {
      const { description, ...rest } = validEvent;
      expect(v.validateEventInput(rest).description).toBe('');
    });

    test.each([
      [{ title: '' }, /title is required/],
      [{ venue: undefined }, /venue is required/],
      [{ date: 'not a date' }, /valid date/],
      [{ date: 12345 }, /valid date/],
      [{ price: -1 }, /price must be/],
      [{ price: '10' }, /price must be/],
      [{ price: 10.999 }, /2 decimal places/],
      [{ capacity: 0 }, /capacity must be/],
      [{ capacity: 2.5 }, /capacity must be/],
      [{ description: 42 }, /description must be/],
    ])('rejects %j', (override, message) => {
      expect(() => v.validateEventInput({ ...validEvent, ...override })).toThrow(message);
    });
  });

  describe('validateBookingInput', () => {
    test('accepts a numeric or string event id', () => {
      expect(v.validateBookingInput({ eventId: 3, quantity: 2 })).toEqual({ eventId: 3, quantity: 2 });
      expect(v.validateBookingInput({ eventId: '3', quantity: 2 })).toEqual({ eventId: 3, quantity: 2 });
    });

    test.each([
      [{ quantity: 2 }, /eventId/],
      [{ eventId: 'abc', quantity: 2 }, /eventId/],
      [{ eventId: 1 }, /quantity must be a whole number/],
      [{ eventId: 1, quantity: 1.5 }, /quantity must be a whole number/],
      [{ eventId: 1, quantity: '2' }, /quantity must be a whole number/],
    ])('rejects %j', (body, message) => {
      expect(() => v.validateBookingInput(body)).toThrow(message);
    });
  });
});
