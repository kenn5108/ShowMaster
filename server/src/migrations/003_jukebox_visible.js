/**
 * Migration 003 — Add jukebox_visible column to songs table.
 * Controls whether each song is published to the Jukebox catalog.
 * Default: 1 (visible) — all existing songs are published by default.
 */
module.exports = {
  version: 3,
  description: 'Add jukebox_visible column to songs table',

  up(db) {
    db.exec(`ALTER TABLE songs ADD COLUMN jukebox_visible INTEGER NOT NULL DEFAULT 1`);
  }
};
