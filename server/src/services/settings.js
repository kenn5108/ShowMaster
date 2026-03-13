const { getDb } = require('../core/database');
const logger = require('../core/logger');

function get(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAll() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function set(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, String(value), String(value));
  logger.info('settings', `Updated ${key} = ${value}`);
}

function setMany(pairs) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  );
  const run = db.transaction((items) => {
    for (const [k, v] of Object.entries(items)) {
      stmt.run(k, String(v), String(v));
    }
  });
  run(pairs);
}

module.exports = { get, getAll, set, setMany };
