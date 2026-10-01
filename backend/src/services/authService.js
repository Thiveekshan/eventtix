'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { AppError } = require('../utils/httpError');
const { validateRegisterInput, validateLoginInput } = require('../domain/validators');

const UNIQUE_VIOLATION = '23505';

// Compared against when the email is unknown, so "no such user" and "wrong password"
// take about the same time and do not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 4);

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function createAuthService({ db, userRepository, config }) {
  async function register(input) {
    const data = validateRegisterInput(input);

    if (await userRepository.findByEmail(db, data.email)) {
      throw new AppError(409, 'An account with this email already exists', 'conflict');
    }

    const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);
    try {
      // Role is always "user": nobody can make themselves an admin through the API.
      const user = await userRepository.create(db, {
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'user',
      });
      return { user: toPublicUser(user) };
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        throw new AppError(409, 'An account with this email already exists', 'conflict');
      }
      throw err;
    }
  }

  async function login(input) {
    const { email, password } = validateLoginInput(input);

    const user = await userRepository.findByEmail(db, email);
    const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new AppError(401, 'Invalid email or password', 'unauthorised');
    }

    const token = jwt.sign({ role: user.role, name: user.name }, config.jwtSecret, {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: config.jwtExpiresIn,
    });
    return { token, user: toPublicUser(user) };
  }

  /** Returns { id, name, role } for a valid token, or throws a 401. */
  function verifyToken(token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      return { id: Number(payload.sub), name: payload.name, role: payload.role };
    } catch {
      throw new AppError(401, 'Invalid or expired token', 'unauthorised');
    }
  }

  return { register, login, verifyToken };
}

module.exports = { createAuthService, toPublicUser };
