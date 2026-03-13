const { getDb } = require('../core/database');

function get(songId) {
  const row = getDb().prepare('SELECT * FROM lyrics WHERE song_id = ?').get(songId);
  return row || { song_id: songId, text: '' };
}

function save(songId, text) {
  getDb().prepare(`
    INSERT INTO lyrics (song_id, text, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(song_id) DO UPDATE SET text = ?, updated_at = datetime('now')
  `).run(songId, text, text);
}

// Sync cues
function getCues(songId) {
  return getDb().prepare(
    'SELECT * FROM sync_cues WHERE song_id = ? ORDER BY time_ms ASC'
  ).all(songId);
}

function saveCues(songId, cues) {
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM sync_cues WHERE song_id = ?').run(songId);
    const stmt = db.prepare(
      'INSERT INTO sync_cues (song_id, line_index, time_ms, type) VALUES (?, ?, ?, ?)'
    );
    for (const cue of cues) {
      stmt.run(songId, cue.line_index, cue.time_ms, cue.type || 'line');
    }
  });
  txn();
}

/**
 * Get lyrics lines as array for prompter.
 */
function getLines(songId) {
  const row = get(songId);
  if (!row.text) return [];
  return row.text.split('\n');
}

/**
 * Compute active line from position and sync cues.
 */
function getActiveLineIndex(songId, positionMs) {
  const cues = getCues(songId);
  if (cues.length === 0) return -1;

  let active = -1;
  for (const cue of cues) {
    if (positionMs >= cue.time_ms) {
      active = cue.line_index;
    } else {
      break;
    }
  }
  return active;
}

module.exports = { get, save, getCues, saveCues, getLines, getActiveLineIndex };
