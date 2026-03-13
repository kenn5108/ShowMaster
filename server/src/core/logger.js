const { getDb } = require('./database');

const LEVELS = ['debug', 'info', 'warn', 'error'];

function log(level, source, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${source}]`;
  const line = `${prefix} ${message}`;

  // Console output
  if (level === 'error') {
    console.error(line, data || '');
  } else if (level === 'warn') {
    console.warn(line, data || '');
  } else {
    console.log(line, data || '');
  }

  // Persist to DB (skip debug for DB)
  if (level !== 'debug') {
    try {
      const db = getDb();
      db.prepare(
        'INSERT INTO logs (level, source, message, data) VALUES (?, ?, ?, ?)'
      ).run(level, source, message, data ? JSON.stringify(data) : null);
    } catch (err) {
      // DB might not be ready yet during bootstrap
      console.error('[logger] Failed to write to DB:', err.message);
    }
  }
}

module.exports = {
  debug: (source, msg, data) => log('debug', source, msg, data),
  info: (source, msg, data) => log('info', source, msg, data),
  warn: (source, msg, data) => log('warn', source, msg, data),
  error: (source, msg, data) => log('error', source, msg, data),
};
