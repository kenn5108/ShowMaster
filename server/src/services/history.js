const { getDb } = require('../core/database');

/**
 * Record a completed song in history.
 * Called only after the 30-second threshold has been reached.
 * Each call creates a new row — no deduplication by song_id.
 */
function record(sessionId, songId, startedAt, finishedAt) {
  const db = getDb();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) as p FROM history WHERE session_id = ?'
  ).get(sessionId);

  db.prepare(
    'INSERT INTO history (session_id, song_id, position, started_at, finished_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, songId, (maxPos?.p ?? -1) + 1, startedAt, finishedAt);
}

function getBySession(sessionId) {
  return getDb().prepare(`
    SELECT h.*, s.title, s.artist, s.duration_ms, s.rs_name
    FROM history h
    JOIN songs s ON s.id = h.song_id
    WHERE h.session_id = ?
    ORDER BY h.position ASC
  `).all(sessionId);
}

function getBySessionForCsv(sessionId) {
  return getDb().prepare(`
    SELECT h.position, s.title, s.artist, s.duration_ms, h.started_at, h.finished_at,
           sess.venue
    FROM history h
    JOIN songs s ON s.id = h.song_id
    JOIN sessions sess ON sess.id = h.session_id
    WHERE h.session_id = ?
    ORDER BY h.position ASC
  `).all(sessionId);
}

function getAllForCsv() {
  return getDb().prepare(`
    SELECT h.position, s.title, s.artist, s.duration_ms, h.started_at, h.finished_at,
           sess.venue, sess.opened_at AS session_date
    FROM history h
    JOIN songs s ON s.id = h.song_id
    JOIN sessions sess ON sess.id = h.session_id
    ORDER BY sess.opened_at DESC, h.position ASC
  `).all();
}

function clearBySession(sessionId) {
  getDb().prepare('DELETE FROM history WHERE session_id = ?').run(sessionId);
}

module.exports = { record, getBySession, getBySessionForCsv, getAllForCsv, clearBySession };
