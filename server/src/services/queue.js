const { getDb } = require('../core/database');
const { getState, updateState } = require('../core/state');
const logger = require('../core/logger');
const pluginEvents = require('../core/plugins/events');

/**
 * QueueManager — persistent queue, session-scoped.
 *
 * Rules:
 *  - Current song is always at position 0 (top), colored, immovable even when paused.
 *  - "Add to top" means insert at position 1 (just after current).
 *  - Reorder is allowed only on non-current items.
 *  - Queue persists across reboots.
 */

function getSessionId() {
  const session = getState().session;
  if (!session) throw new Error('No active session');
  return session.id;
}

/**
 * Load queue from DB and update state.
 */
function load() {
  const session = getState().session;
  if (!session) {
    updateState({ queue: [] });
    return [];
  }

  const rows = getDb().prepare(`
    SELECT q.id, q.song_id, q.position, q.is_current, q.played,
           s.title, s.artist, s.duration_ms, s.rs_name, s.tags, s.key_signature, s.bpm,
           s.rs_available
    FROM queue q
    JOIN songs s ON s.id = q.song_id
    WHERE q.session_id = ?
    ORDER BY q.position ASC
  `).all(session.id);

  const queue = rows.map(r => ({
    ...r,
    tags: tryParseJson(r.tags, []),
  }));

  updateState({ queue });
  pluginEvents.emit('queue:changed', queue);
  return queue;
}

/**
 * Add a song to the queue.
 * @param {number} songId
 * @param {'top'|'bottom'} position - 'top' inserts at pos 1, 'bottom' appends
 */
function add(songId, position = 'bottom') {
  const db = getDb();
  const sessionId = getSessionId();

  // Block adding unavailable songs
  const song = db.prepare('SELECT rs_available FROM songs WHERE id = ?').get(songId);
  if (!song) throw new Error('Song not found');
  if (!song.rs_available) throw new Error('Cette chanson n\'est plus disponible dans RocketShow');

  const currentQueue = getState().queue;

  if (position === 'top') {
    // Insert at position 1 (after current song at 0)
    // Shift all non-current items down
    db.prepare(`
      UPDATE queue SET position = position + 1
      WHERE session_id = ? AND position >= 1
    `).run(sessionId);

    const insertPos = currentQueue.length === 0 ? 0 : 1;
    db.prepare(`
      INSERT INTO queue (session_id, song_id, position) VALUES (?, ?, ?)
    `).run(sessionId, songId, insertPos);
  } else {
    // Add at bottom
    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(position), -1) as maxPos FROM queue WHERE session_id = ?'
    ).get(sessionId);
    const newPos = (maxRow?.maxPos ?? -1) + 1;

    db.prepare(`
      INSERT INTO queue (session_id, song_id, position) VALUES (?, ?, ?)
    `).run(sessionId, songId, newPos);
  }

  logger.info('queue', `Added song #${songId} at ${position}`);
  const result = load();
  pluginEvents.emit('queue:item-added', { songId, position, queue: result });
  return result;
}

/**
 * Add multiple songs to the queue in one operation, preserving order.
 * @param {number[]} songIds - ordered list of song IDs
 * @param {'top'|'bottom'} position
 */
function addBatch(songIds, position = 'bottom') {
  const db = getDb();
  const sessionId = getSessionId();

  // Filter out unavailable songs
  const available = songIds.filter(id => {
    const song = db.prepare('SELECT rs_available FROM songs WHERE id = ?').get(id);
    return song && song.rs_available;
  });
  if (available.length === 0) return load();

  const currentQueue = getState().queue;

  if (position === 'top') {
    // Shift existing items down to make room for all new songs
    db.prepare(`
      UPDATE queue SET position = position + ?
      WHERE session_id = ? AND position >= 1
    `).run(available.length, sessionId);

    const startPos = currentQueue.length === 0 ? 0 : 1;
    const stmt = db.prepare('INSERT INTO queue (session_id, song_id, position) VALUES (?, ?, ?)');
    const txn = db.transaction(() => {
      available.forEach((songId, i) => {
        stmt.run(sessionId, songId, startPos + i);
      });
    });
    txn();
  } else {
    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(position), -1) as maxPos FROM queue WHERE session_id = ?'
    ).get(sessionId);
    let pos = (maxRow?.maxPos ?? -1) + 1;

    const stmt = db.prepare('INSERT INTO queue (session_id, song_id, position) VALUES (?, ?, ?)');
    const txn = db.transaction(() => {
      available.forEach((songId) => {
        stmt.run(sessionId, songId, pos++);
      });
    });
    txn();
  }

  logger.info('queue', `Batch added ${available.length} songs at ${position}`);
  return load();
}

/**
 * Remove a song from the queue (cannot remove current song).
 */
function remove(queueItemId) {
  const db = getDb();
  const sessionId = getSessionId();

  const item = db.prepare('SELECT * FROM queue WHERE id = ? AND session_id = ?').get(queueItemId, sessionId);
  if (!item) throw new Error('Queue item not found');

  // Only block removal if the song is actively playing or paused
  if (item.is_current) {
    const playerState = getState().rocketshow?.playerState || 'STOPPED';
    if (playerState === 'PLAYING' || playerState === 'PAUSED') {
      throw new Error('Cannot remove a song that is currently playing');
    }
  }

  db.prepare('DELETE FROM queue WHERE id = ?').run(queueItemId);
  reindex(sessionId);
  logger.info('queue', `Removed queue item #${queueItemId}`);
  return load();
}

/**
 * Move a queue item to a new position (cannot move current song).
 */
function move(queueItemId, newPosition) {
  const db = getDb();
  const sessionId = getSessionId();

  const item = db.prepare('SELECT * FROM queue WHERE id = ? AND session_id = ?').get(queueItemId, sessionId);
  if (!item) throw new Error('Queue item not found');
  if (item.is_current) throw new Error('Cannot move a song that is currently playing');

  const oldPos = item.position;
  if (oldPos === newPosition) return load();

  if (oldPos < newPosition) {
    db.prepare(`
      UPDATE queue SET position = position - 1
      WHERE session_id = ? AND position > ? AND position <= ?
    `).run(sessionId, oldPos, newPosition);
  } else {
    db.prepare(`
      UPDATE queue SET position = position + 1
      WHERE session_id = ? AND position >= ? AND position < ?
    `).run(sessionId, newPosition, oldPos);
  }

  db.prepare('UPDATE queue SET position = ? WHERE id = ?').run(newPosition, queueItemId);
  logger.info('queue', `Moved queue item #${queueItemId} to position ${newPosition}`);
  return load();
}

/**
 * Mark a song as current (playing). Called by PlaybackManager.
 */
function setCurrent(queueItemId) {
  const db = getDb();
  const sessionId = getSessionId();

  db.prepare('UPDATE queue SET is_current = 0 WHERE session_id = ?').run(sessionId);
  if (queueItemId) {
    db.prepare('UPDATE queue SET is_current = 1 WHERE id = ? AND session_id = ?').run(queueItemId, sessionId);
  }
  return load();
}

/**
 * Clear is_current flag on all items (called on Stop).
 * Makes the previously-current item movable/removable again.
 */
function clearCurrent() {
  const db = getDb();
  const session = getState().session;
  if (!session) return [];
  db.prepare('UPDATE queue SET is_current = 0 WHERE session_id = ?').run(session.id);
  logger.info('queue', 'Cleared is_current (stop)');
  return load();
}

/**
 * Advance to the next song in queue.
 * Marks current as played, promotes next to current.
 * Returns the new current queue item or null if queue is empty.
 */
/**
 * Advance to the next song in queue.
 * Marks current as played, removes it, promotes the next.
 * @param {boolean} markAsCurrent - if true, set is_current=1 on promoted item (default: true).
 *   Pass false when advancing without starting playback (manual mode prepare).
 */
function advance(markAsCurrent = true) {
  const db = getDb();
  const sessionId = getSessionId();

  // Mark current as played
  db.prepare(`
    UPDATE queue SET is_current = 0, played = 1 WHERE session_id = ? AND is_current = 1
  `).run(sessionId);

  // Remove played items and reindex
  db.prepare(`
    DELETE FROM queue WHERE session_id = ? AND played = 1
  `).run(sessionId);

  reindex(sessionId);

  // The new first item
  const next = db.prepare(`
    SELECT * FROM queue WHERE session_id = ? ORDER BY position ASC LIMIT 1
  `).get(sessionId);

  if (next) {
    if (markAsCurrent) {
      db.prepare('UPDATE queue SET is_current = 1, position = 0 WHERE id = ?').run(next.id);
    } else {
      // Just ensure position = 0, but don't mark as current (not playing yet)
      db.prepare('UPDATE queue SET position = 0 WHERE id = ?').run(next.id);
    }
  }

  const queue = load();
  return queue.length > 0 ? queue[0] : null;
}

/**
 * Clear the queue (except current if playing).
 */
function clear(keepCurrent = true) {
  const db = getDb();
  const sessionId = getSessionId();

  if (keepCurrent) {
    db.prepare('DELETE FROM queue WHERE session_id = ? AND is_current = 0').run(sessionId);
  } else {
    db.prepare('DELETE FROM queue WHERE session_id = ?').run(sessionId);
  }

  reindex(sessionId);
  logger.info('queue', 'Queue cleared');
  return load();
}

/**
 * Reindex positions to be contiguous starting from 0.
 */
function reindex(sessionId) {
  const db = getDb();
  const items = db.prepare(
    'SELECT id FROM queue WHERE session_id = ? ORDER BY position ASC'
  ).all(sessionId);

  const stmt = db.prepare('UPDATE queue SET position = ? WHERE id = ?');
  const txn = db.transaction(() => {
    items.forEach((item, idx) => stmt.run(idx, item.id));
  });
  txn();
}

/**
 * Load queue from a playlist (append all its songs).
 */
function loadFromPlaylist(playlistId) {
  const db = getDb();
  const sessionId = getSessionId();

  const items = db.prepare(`
    SELECT song_id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC
  `).all(playlistId);

  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(position), -1) as maxPos FROM queue WHERE session_id = ?'
  ).get(sessionId);
  let pos = (maxRow?.maxPos ?? -1) + 1;

  const stmt = db.prepare('INSERT INTO queue (session_id, song_id, position) VALUES (?, ?, ?)');
  const txn = db.transaction(() => {
    for (const item of items) {
      stmt.run(sessionId, item.song_id, pos++);
    }
  });
  txn();

  logger.info('queue', `Loaded ${items.length} songs from playlist #${playlistId}`);
  return load();
}

/**
 * Remove the head item (position 0) regardless of is_current flag.
 * Used by skipWhileStopped() when the head may or may not be marked current.
 */
function removeHead() {
  const db = getDb();
  const sessionId = getSessionId();

  const head = db.prepare(
    'SELECT id FROM queue WHERE session_id = ? ORDER BY position ASC LIMIT 1'
  ).get(sessionId);

  if (!head) return [];

  db.prepare('DELETE FROM queue WHERE id = ?').run(head.id);
  reindex(sessionId);
  logger.info('queue', `Removed head item #${head.id} (skip while stopped)`);
  return load();
}

function tryParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { load, add, addBatch, remove, move, setCurrent, clearCurrent, advance, clear, loadFromPlaylist, removeHead };
