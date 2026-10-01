'use strict';

const { AppError } = require('../utils/httpError');

const MAX_INT = 2147483647;

function invalid(message) {
  return new AppError(400, message, 'validation');
}

function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Request body must be a JSON object');
  }
  return body;
}

function requireText(value, field, { max, min = 1 }) {
  if (typeof value !== 'string') {
    throw invalid(`${field} is required`);
  }
  const text = value.trim();
  if (text.length < min) {
    throw invalid(`${field} is required`);
  }
  if (text.length > max) {
    throw invalid(`${field} must be at most ${max} characters`);
  }
  return text;
}

/** A deliberately simple email check (no regular expression to backtrack on). */
function isValidEmail(email) {
  if (email.length > 254 || /\s/.test(email)) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }
  const [local, domain] = parts;
  return (
    local.length > 0 &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..')
  );
}

function requireEmail(value) {
  const email = requireText(value, 'email', { max: 254 }).toLowerCase();
  if (!isValidEmail(email)) {
    throw invalid('email must be a valid email address');
  }
  return email;
}

function parseId(value) {
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_INT) {
    throw invalid('Invalid id');
  }
  return Number(text);
}

function validateRegisterInput(body) {
  const input = requireObject(body);
  const name = requireText(input.name, 'name', { max: 100 });
  const email = requireEmail(input.email);
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected.
  if (
    typeof input.password !== 'string' ||
    input.password.length < 8 ||
    Buffer.byteLength(input.password) > 72
  ) {
    throw invalid('password must be between 8 and 72 characters');
  }
  return { name, email, password: input.password };
}

function validateLoginInput(body) {
  const input = requireObject(body);
  const email = requireEmail(input.email);
  if (typeof input.password !== 'string' || input.password.length === 0) {
    throw invalid('password is required');
  }
  return { email, password: input.password };
}

function validateEventInput(body) {
  const input = requireObject(body);
  const title = requireText(input.title, 'title', { max: 200 });
  const venue = requireText(input.venue, 'venue', { max: 200 });

  let description = '';
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string' || input.description.length > 5000) {
      throw invalid('description must be text of at most 5000 characters');
    }
    description = input.description.trim();
  }

  const date = new Date(input.date);
  if (typeof input.date !== 'string' || Number.isNaN(date.getTime())) {
    throw invalid('date must be a valid date');
  }

  const price = input.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000) {
    throw invalid('price must be a number between 0 and 100000');
  }
  if (Math.round(price * 100) / 100 !== price) {
    throw invalid('price can have at most 2 decimal places');
  }

  const capacity = input.capacity;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
    throw invalid('capacity must be a whole number between 1 and 100000');
  }

  return { title, description, venue, date: date.toISOString(), price, capacity };
}

function validateBookingInput(body) {
  const input = requireObject(body);
  const eventId = Number(input.eventId);
  if (!Number.isInteger(eventId) || eventId < 1 || eventId > MAX_INT) {
    throw invalid('eventId must be a valid event id');
  }
  if (!Number.isInteger(input.quantity)) {
    throw invalid('quantity must be a whole number');
  }
  return { eventId, quantity: input.quantity };
}

module.exports = {
  isValidEmail,
  parseId,
  validateRegisterInput,
  validateLoginInput,
  validateEventInput,
  validateBookingInput,
};
