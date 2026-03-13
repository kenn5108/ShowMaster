const { getDb } = require('../core/database');
const logger = require('../core/logger');

/**
 * Library service — manages the local songs mirror.
 * Songs are synced from RocketShow compositions.
 * Format: "Titre - Artiste" in the RS composition name.
 */

function parseCompositionName(rsName) {
  const parts = rsName.split(' - ');
  if (parts.length >= 2) {
    return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim() };
  }
  return { title: rsName.trim(), artist: '' };
}

/**
 * Sync local DB with RocketShow compositions list.
 * Marks missing compositions as rs_available=0 (keeps them locally).
 */
function syncFromRocketShow(compositions) {
  const db = getDb();

  const rsNames = new Set();

  const upsert = db.prepare(`
    INSERT INTO songs (rs_name, title, artist, duration_ms, tags, key_signature, bpm, rs_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(rs_name) DO UPDATE SET
      duration_ms = excluded.duration_ms,
      tags = excluded.tags,
      key_signature = excluded.key_signature,
      bpm = excluded.bpm,
      rs_available = 1,
      updated_at = datetime('now')
  `);

  const markUnavailable = db.prepare(`
    UPDATE songs SET rs_available = 0, updated_at = datetime('now') WHERE rs_name = ?
  `);

  const txn = db.transaction(() => {
    for (const comp of compositions) {
      const name = comp.name || comp;
      rsNames.add(name);
      const { title, artist } = parseCompositionName(name);
      const durationMs = comp.durationMillis || comp.duration || 0;
      // Tags, key, BPM come from notes/metadata if available
      const notes = comp.notes || '';
      const { tags, key_signature, bpm } = parseNotes(notes);

      upsert.run(name, title, artist, durationMs, JSON.stringify(tags), key_signature, bpm);
    }

    // Mark compositions no longer in RS as unavailable
    const allSongs = db.prepare('SELECT rs_name FROM songs WHERE rs_available = 1').all();
    for (const song of allSongs) {
      if (!rsNames.has(song.rs_name)) {
        markUnavailable.run(song.rs_name);
      }
    }
  });

  txn();
  logger.info('library', `Synced ${compositions.length} compositions from RocketShow`);
}

/**
 * Parse RocketShow notes field for tags, key, BPM.
 * RS uses newline-separated key:value pairs in the notes field:
 *   tags:rock,pop,2000
 *   key:Bb
 *   BPM:120
 * Also supports semicolons as separator for backwards compatibility.
 */
function parseNotes(notes) {
  const result = { tags: [], key_signature: '', bpm: null };
  if (!notes) return result;

  // Split on newlines and/or semicolons
  const lines = notes.split(/[\n;]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Split on first colon only (value may contain colons)
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 1) continue;
    const k = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const v = trimmed.substring(colonIdx + 1).trim();
    if (!v) continue;

    if (k === 'tags') {
      result.tags = v.split(',').map(t => t.trim()).filter(Boolean);
    } else if (k === 'key') {
      result.key_signature = v;
    } else if (k === 'bpm') {
      result.bpm = parseInt(v, 10) || null;
    }
  }
  return result;
}

function getAll(sortBy = 'title', sortDir = 'asc') {
  const validSorts = { title: 'title', artist: 'artist' };
  const col = validSorts[sortBy] || 'title';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  return getDb().prepare(
    `SELECT * FROM songs ORDER BY ${col} COLLATE NOCASE ${dir}`
  ).all();
}

function getById(id) {
  return getDb().prepare('SELECT * FROM songs WHERE id = ?').get(id);
}

function getByRsName(rsName) {
  return getDb().prepare('SELECT * FROM songs WHERE rs_name = ?').get(rsName);
}

function update(id, fields) {
  const allowed = ['tags', 'key_signature', 'bpm'];
  const sets = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(key === 'tags' ? JSON.stringify(value) : value);
    }
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(id);

  getDb().prepare(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function search(query) {
  return getDb().prepare(
    `SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? ORDER BY title COLLATE NOCASE`
  ).all(`%${query}%`, `%${query}%`);
}

module.exports = { syncFromRocketShow, getAll, getById, getByRsName, update, search, parseCompositionName };
