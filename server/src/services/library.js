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
 * Returns detailed results for the frontend to handle rename detection.
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

  // Track which songs existed before sync
  const existingNames = new Set(
    db.prepare('SELECT rs_name FROM songs').all().map(s => s.rs_name)
  );

  const newSongs = [];
  const missingSongs = [];

  const txn = db.transaction(() => {
    for (const comp of compositions) {
      const name = comp.name || comp;
      rsNames.add(name);
      const { title, artist } = parseCompositionName(name);
      const durationMs = comp.durationMillis || comp.duration || 0;
      const notes = comp.notes || '';
      const { tags, key_signature, bpm } = parseNotes(notes);

      upsert.run(name, title, artist, durationMs, JSON.stringify(tags), key_signature, bpm);

      // Track genuinely new songs (not just re-synced existing ones)
      if (!existingNames.has(name)) {
        const song = db.prepare('SELECT id, rs_name, title, artist, duration_ms FROM songs WHERE rs_name = ?').get(name);
        if (song) newSongs.push(song);
      }
    }

    // Mark compositions no longer in RS as unavailable
    const availableSongs = db.prepare('SELECT id, rs_name, title, artist, duration_ms FROM songs WHERE rs_available = 1').all();
    for (const song of availableSongs) {
      if (!rsNames.has(song.rs_name)) {
        markUnavailable.run(song.rs_name);
        missingSongs.push(song);
      }
    }
  });

  txn();
  logger.info('library', `Synced ${compositions.length} compositions — ${newSongs.length} new, ${missingSongs.length} missing`);

  // Compute suggestions if both new and missing exist
  let suggestions = [];
  if (newSongs.length > 0 && missingSongs.length > 0) {
    suggestions = computeSuggestions(missingSongs, newSongs);
  }

  return {
    synced: compositions.length,
    newSongs,
    missingSongs,
    suggestions,
  };
}

/**
 * Compute similarity suggestions between missing and new songs.
 * Returns array of { missingSongId, newSongId, score, missingTitle, newTitle }
 */
function computeSuggestions(missingSongs, newSongs) {
  const suggestions = [];

  for (const missing of missingSongs) {
    let bestMatch = null;
    let bestScore = 0;

    for (const newSong of newSongs) {
      const score = similarityScore(missing, newSong);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = newSong;
      }
    }

    if (bestMatch && bestScore >= 20) {
      suggestions.push({
        missingSongId: missing.id,
        newSongId: bestMatch.id,
        missingTitle: missing.title,
        missingArtist: missing.artist,
        missingRsName: missing.rs_name,
        newTitle: bestMatch.title,
        newArtist: bestMatch.artist,
        newRsName: bestMatch.rs_name,
        score: Math.round(bestScore),
      });
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

/**
 * Similarity score between two songs (0-100).
 * Based on title similarity, artist match, and duration proximity.
 */
function similarityScore(songA, songB) {
  let score = 0;

  // Title word overlap (Jaccard coefficient) — 0-50 points
  const wordsA = normalize(songA.title).split(/\s+/).filter(Boolean);
  const wordsB = normalize(songB.title).split(/\s+/).filter(Boolean);
  if (wordsA.length > 0 || wordsB.length > 0) {
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    score += (intersection / union) * 50;
  }

  // Artist match — 0-30 points
  const artistA = normalize(songA.artist);
  const artistB = normalize(songB.artist);
  if (artistA && artistB) {
    if (artistA === artistB) {
      score += 30;
    } else {
      // Partial artist match (word overlap)
      const aWords = artistA.split(/\s+/).filter(Boolean);
      const bWords = artistB.split(/\s+/).filter(Boolean);
      const aSet = new Set(aWords);
      const bSet = new Set(bWords);
      const inter = [...aSet].filter(w => bSet.has(w)).length;
      const uni = new Set([...aSet, ...bSet]).size;
      score += (inter / uni) * 20;
    }
  }

  // Duration proximity — 0-20 points
  const durA = songA.duration_ms || 0;
  const durB = songB.duration_ms || 0;
  if (durA > 0 && durB > 0) {
    const diff = Math.abs(durA - durB);
    const maxDur = Math.max(durA, durB);
    const ratio = 1 - (diff / maxDur);
    score += ratio * 20;
  }

  return score;
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Get similarity suggestions for a specific missing song.
 * Returns top 3 matches from available songs, sorted by score.
 */
function getSuggestionsForSong(songId) {
  const db = getDb();
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) throw new Error('Song not found');

  const availableSongs = db.prepare(
    'SELECT id, rs_name, title, artist, duration_ms FROM songs WHERE rs_available = 1 AND id != ?'
  ).all(songId);

  const suggestions = [];
  for (const candidate of availableSongs) {
    const score = similarityScore(song, candidate);
    if (score >= 15) {
      suggestions.push({
        songId: candidate.id,
        title: candidate.title,
        artist: candidate.artist,
        duration_ms: candidate.duration_ms,
        score: Math.round(score),
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 3);
}

/**
 * Reassociate a missing song with a new RocketShow composition.
 * - Updates the old song's rs_name, title, artist, duration to match the new one
 * - Deletes the auto-created duplicate for the new rs_name
 * - Preserves lyrics, sync cues, playlist memberships, queue entries
 */
function reassociate(oldSongId, newSongId) {
  const db = getDb();

  const oldSong = db.prepare('SELECT * FROM songs WHERE id = ?').get(oldSongId);
  const newSong = db.prepare('SELECT * FROM songs WHERE id = ?').get(newSongId);

  if (!oldSong) throw new Error('Old song not found');
  if (!newSong) throw new Error('New song not found');

  const txn = db.transaction(() => {
    // 1. Transfer playlist_items from newSong → oldSong
    db.prepare('UPDATE OR IGNORE playlist_items SET song_id = ? WHERE song_id = ?').run(oldSongId, newSongId);
    db.prepare('DELETE FROM playlist_items WHERE song_id = ?').run(newSongId);

    // 2. Transfer queue entries from newSong → oldSong
    db.prepare('UPDATE queue SET song_id = ? WHERE song_id = ?').run(oldSongId, newSongId);

    // 3. Transfer history entries from newSong → oldSong
    db.prepare('UPDATE history SET song_id = ? WHERE song_id = ?').run(oldSongId, newSongId);

    // 4. Merge lyrics: keep oldSong lyrics (ShowMaster data), delete newSong's
    db.prepare('DELETE FROM lyrics WHERE song_id = ?').run(newSongId);

    // 5. Merge sync_cues: keep oldSong cues (ShowMaster data), delete newSong's
    db.prepare('DELETE FROM sync_cues WHERE song_id = ?').run(newSongId);

    // 6. Now safe to delete the duplicate (no more FK references)
    db.prepare('DELETE FROM songs WHERE id = ?').run(newSongId);

    // 7. Update the old song with new RS data
    db.prepare(`
      UPDATE songs SET
        rs_name = ?,
        title = ?,
        artist = ?,
        duration_ms = ?,
        rs_available = 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newSong.rs_name, newSong.title, newSong.artist, newSong.duration_ms, oldSongId);
  });

  txn();
  logger.info('library', `Reassociated song #${oldSongId} ("${oldSong.title}") → "${newSong.rs_name}"`);

  return getById(oldSongId);
}

/**
 * Permanently delete a song and all its references.
 */
function deleteSong(id) {
  const db = getDb();
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
  if (!song) throw new Error('Song not found');

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM playlist_items WHERE song_id = ?').run(id);
    db.prepare('DELETE FROM queue WHERE song_id = ?').run(id);
    db.prepare('DELETE FROM lyrics WHERE song_id = ?').run(id);
    db.prepare('DELETE FROM sync_cues WHERE song_id = ?').run(id);
    db.prepare('DELETE FROM songs WHERE id = ?').run(id);
  });

  txn();
  logger.info('library', `Deleted song #${id} ("${song.title}")`);
}

/**
 * Parse RocketShow notes field for tags, key, BPM.
 */
function parseNotes(notes) {
  const result = { tags: [], key_signature: '', bpm: null };
  if (!notes) return result;

  const lines = notes.split(/[\n;]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
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
  const allowed = ['tags', 'key_signature', 'bpm', 'jukebox_visible'];
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

module.exports = {
  syncFromRocketShow, getAll, getById, getByRsName, update, search,
  parseCompositionName, reassociate, deleteSong, getSuggestionsForSong,
};
