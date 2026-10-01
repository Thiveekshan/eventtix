'use strict';

const rules = require('../../src/domain/bookingRules');
const { makeEvent } = require('../helpers/fakes');

describe('booking rules', () => {
  describe('BR2: quantity per booking', () => {
    test.each([1, 2, 6])('allows %i tickets', (quantity) => {
      expect(() => rules.assertQuantityAllowed(quantity)).not.toThrow();
    });

    test.each([0, -1, 7, 100, 1.5, '3', null, undefined])('rejects %p tickets', (quantity) => {
      expect(() => rules.assertQuantityAllowed(quantity)).toThrow(/between 1 and 6/);
    });
  });

  describe('BR3: past events', () => {
    const now = new Date('2026-06-01T12:00:00Z');

    test('allows a future event', () => {
      const event = makeEvent({ date: '2026-06-02T12:00:00Z' });
      expect(() => rules.assertEventNotPast(event, now)).not.toThrow();
    });

    test('rejects a past event with status 409', () => {
      const event = makeEvent({ date: '2026-05-31T12:00:00Z' });
      expect(() => rules.assertEventNotPast(event, now)).toThrow(/already taken place/);
      try {
        rules.assertEventNotPast(event, now);
      } catch (err) {
        expect(err.status).toBe(409);
        expect(err.reason).toBe('past_event');
      }
    });

    test('rejects an event happening right now', () => {
      const event = makeEvent({ date: now.toISOString() });
      expect(() => rules.assertEventNotPast(event, now)).toThrow();
    });
  });

  describe('BR1: seats available', () => {
    test('allows booking exactly the seats left', () => {
      expect(() => rules.assertSeatsAvailable(makeEvent({ seatsAvailable: 3 }), 3)).not.toThrow();
    });

    test('rejects booking more than the seats left', () => {
      expect(() => rules.assertSeatsAvailable(makeEvent({ seatsAvailable: 2 }), 3)).toThrow(/Only 2 seat/);
    });

    test('reports a sold-out event clearly', () => {
      try {
        rules.assertSeatsAvailable(makeEvent({ seatsAvailable: 0 }), 1);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).toMatch(/sold out/);
        expect(err.reason).toBe('sold_out');
      }
    });
  });

  describe('calculateTotal', () => {
    test('multiplies price by quantity', () => {
      expect(rules.calculateTotal(10, 3)).toBe(30);
    });

    test('avoids floating point errors', () => {
      expect(rules.calculateTotal(19.99, 3)).toBe(59.97);
      expect(rules.calculateTotal(0.1, 3)).toBe(0.3);
    });

    test('free events cost nothing', () => {
      expect(rules.calculateTotal(0, 4)).toBe(0);
    });
  });

  describe('BR5: access to bookings', () => {
    const booking = { id: 1, userId: 5 };

    test('the owner can access their booking', () => {
      expect(rules.canAccessBooking({ id: 5, role: 'user' }, booking)).toBe(true);
    });

    test('another user cannot', () => {
      expect(rules.canAccessBooking({ id: 6, role: 'user' }, booking)).toBe(false);
    });

    test('an admin can access any booking', () => {
      expect(rules.canAccessBooking({ id: 99, role: 'admin' }, booking)).toBe(true);
    });
  });
});
