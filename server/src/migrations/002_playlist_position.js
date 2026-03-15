/**
 * Migration 002 — Add position column to playlists for manual ordering
 */
module.exports = {
  version: 2,
  description: 'Add position column to playlists table',

  up(db) {
    // Add position column with default 0
    db.exec(`ALTER TABLE playlists ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);

    // Initialize positions based on current alphabetical order
    const playlists = db.prepare('SELECT id FROM playlists ORDER BY name COLLATE NOCASE').all();
    const stmt = db.prepare('UPDATE playlists SET position = ? WHERE id = ?');
    playlists.forEach((pl, idx) => stmt.run(idx, pl.id));
  }
};
