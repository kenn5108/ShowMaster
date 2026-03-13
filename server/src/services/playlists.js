const { getDb } = require('../core/database');
const logger = require('../core/logger');

function getAll() {
  return getDb().prepare('SELECT * FROM playlists ORDER BY name COLLATE NOCASE').all();
}

function getById(id) {
  return getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(id);
}

function create(name) {
  const result = getDb().prepare('INSERT INTO playlists (name) VALUES (?)').run(name.trim());
  logger.info('playlists', `Created playlist "${name}" (#${result.lastInsertRowid})`);
  return getById(result.lastInsertRowid);
}

function rename(id, name) {
  getDb().prepare(`UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name.trim(), id);
}

function remove(id) {
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id);
  logger.info('playlists', `Deleted playlist #${id}`);
}

// Items
function getItems(playlistId, sortBy = 'position', sortDir = 'asc') {
  const validSorts = { position: 'pi.position', title: 's.title', artist: 's.artist' };
  const col = validSorts[sortBy] || 'pi.position';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

  return getDb().prepare(`
    SELECT pi.id, pi.playlist_id, pi.song_id, pi.position,
           s.title, s.artist, s.duration_ms, s.rs_name, s.tags, s.key_signature, s.bpm
    FROM playlist_items pi
    JOIN songs s ON s.id = pi.song_id
    WHERE pi.playlist_id = ?
    ORDER BY ${col} COLLATE NOCASE ${dir}
  `).all(playlistId);
}

function addItem(playlistId, songId) {
  const db = getDb();
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(position), -1) as p FROM playlist_items WHERE playlist_id = ?'
  ).get(playlistId);

  const result = db.prepare(
    'INSERT INTO playlist_items (playlist_id, song_id, position) VALUES (?, ?, ?)'
  ).run(playlistId, songId, (maxRow?.p ?? -1) + 1);

  db.prepare(`UPDATE playlists SET updated_at = datetime('now') WHERE id = ?`).run(playlistId);
  return result.lastInsertRowid;
}

function removeItem(itemId) {
  const item = getDb().prepare('SELECT * FROM playlist_items WHERE id = ?').get(itemId);
  if (!item) return;

  getDb().prepare('DELETE FROM playlist_items WHERE id = ?').run(itemId);
  reindexPlaylist(item.playlist_id);
}

function moveItem(itemId, newPosition) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM playlist_items WHERE id = ?').get(itemId);
  if (!item) return;

  const oldPos = item.position;
  if (oldPos === newPosition) return;

  if (oldPos < newPosition) {
    db.prepare(`
      UPDATE playlist_items SET position = position - 1
      WHERE playlist_id = ? AND position > ? AND position <= ?
    `).run(item.playlist_id, oldPos, newPosition);
  } else {
    db.prepare(`
      UPDATE playlist_items SET position = position + 1
      WHERE playlist_id = ? AND position >= ? AND position < ?
    `).run(item.playlist_id, newPosition, oldPos);
  }

  db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?').run(newPosition, itemId);
  db.prepare(`UPDATE playlists SET updated_at = datetime('now') WHERE id = ?`).run(item.playlist_id);
}

function reindexPlaylist(playlistId) {
  const db = getDb();
  const items = db.prepare(
    'SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC'
  ).all(playlistId);

  const stmt = db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?');
  const txn = db.transaction(() => {
    items.forEach((item, idx) => stmt.run(idx, item.id));
  });
  txn();
}

module.exports = { getAll, getById, create, rename, remove, getItems, addItem, removeItem, moveItem };
