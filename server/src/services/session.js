const { getDb } = require('../core/database');
const { getState, updateState } = require('../core/state');
const logger = require('../core/logger');
const pluginEvents = require('../core/plugins/events');

/**
 * SessionManager — handles session lifecycle.
 * Rules:
 *  - At startup, if an active (non-closed) session exists, auto-restore it.
 *  - If no active session, system requires venue input to open one.
 *  - Close is only allowed if queue is empty and nothing is playing.
 */

function init() {
  const active = getDb().prepare(
    'SELECT * FROM sessions WHERE is_active = 1 AND closed_at IS NULL ORDER BY id DESC LIMIT 1'
  ).get();

  if (active) {
    logger.info('session', `Restored active session #${active.id} at "${active.venue}"`);
    updateState({ session: { id: active.id, venue: active.venue, opened_at: active.opened_at } });
  } else {
    logger.info('session', 'No active session found. Waiting for venue input.');
    updateState({ session: null });
  }
}

function open(venue) {
  const current = getState().session;
  if (current) {
    throw new Error('A session is already active. Close it first.');
  }

  const result = getDb().prepare(
    'INSERT INTO sessions (venue) VALUES (?)'
  ).run(venue.trim());

  const session = { id: result.lastInsertRowid, venue: venue.trim(), opened_at: new Date().toISOString() };
  updateState({ session });
  logger.info('session', `Opened session #${session.id} at "${session.venue}"`);
  pluginEvents.emit('session:opened', session);
  return session;
}

function close() {
  const current = getState().session;
  if (!current) {
    throw new Error('No active session.');
  }

  // Check queue and playback state
  const state = getState();
  const queueHasItems = state.queue.length > 0;
  const isPlaying = state.rocketshow.playerState === 'PLAYING' || state.rocketshow.playerState === 'PAUSED';

  if (queueHasItems || isPlaying) {
    throw new Error('Cannot close session: queue is not empty or playback is active.');
  }

  getDb().prepare(
    `UPDATE sessions SET is_active = 0, closed_at = datetime('now') WHERE id = ?`
  ).run(current.id);

  updateState({ session: null });
  logger.info('session', `Closed session #${current.id}`);
  pluginEvents.emit('session:closed');
}

function getCurrent() {
  return getState().session;
}

function getAll() {
  return getDb().prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM history h WHERE h.session_id = s.id) AS song_count
    FROM sessions s
    ORDER BY s.opened_at DESC
  `).all();
}

module.exports = { init, open, close, getCurrent, getAll };
