'use strict';

const config = require('./config');

// Structured (JSON) logging: one line per event, easy for log tools to parse.
const silent = config.env === 'test' && process.env.LOG_IN_TESTS !== 'true';

function write(level, message, fields) {
  if (silent) {
    return;
  }
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

module.exports = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
