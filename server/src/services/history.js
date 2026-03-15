const { getDb } = require('../core/database');

function recordStart(sessionId, songId) {
  const existing = getDb().prepare(
    'SELECT * FROM history WHERE session_id = ? AND song_id = ? AND finished_at IS NULL'
  ).get(sessionId, songId);

  if (!existing) {
    const maxPos = getDb().prepare(
      'SELECT COALESCE(MAX(position), -1) as p FROM history WHERE session_id = ?'
    ).get(sessionId);

    getDb().prepare(
      'INSERT INTO history (session_id, song_id, position) VALUES (?, ?, ?)'
    ).run(sessionId, songId, (maxPos?.p ?? -1) + 1);
  }
}

function recordEnd(sessionId, songId) {
  getDb().prepare(
    `UPDATE history SET finished_at = datetime('now') WHERE session_id = ? AND song_id = ? AND finished_at IS NULL`
  ).run(sessionId, songId);
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

module.exports = { recordStart, recordEnd, getBySession, getBySessionForCsv, getAllForCsv, clearBySession };
