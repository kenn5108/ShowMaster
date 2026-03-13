/**
 * Migration 001 — Initial schema for ShowMaster V2
 */
module.exports = {
  version: 1,
  description: 'Initial schema: sessions, songs, playlists, queue, lyrics, sync_cues, history, settings, logs',

  up(db) {
    db.exec(`
      -- Sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        venue         TEXT NOT NULL,
        opened_at     TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at     TEXT,
        is_active     INTEGER NOT NULL DEFAULT 1
      );

      -- Songs (local mirror of RocketShow compositions)
      CREATE TABLE IF NOT EXISTS songs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        rs_name       TEXT NOT NULL UNIQUE,
        title         TEXT NOT NULL,
        artist        TEXT NOT NULL DEFAULT '',
        duration_ms   INTEGER NOT NULL DEFAULT 0,
        tags          TEXT NOT NULL DEFAULT '[]',
        key_signature TEXT NOT NULL DEFAULT '',
        bpm           INTEGER,
        rs_available  INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Playlists
      CREATE TABLE IF NOT EXISTS playlists (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Playlist items (join table with ordering)
      CREATE TABLE IF NOT EXISTS playlist_items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id   INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        song_id       INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        position      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, position);

      -- Queue (persistent, session-scoped)
      CREATE TABLE IF NOT EXISTS queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        song_id       INTEGER NOT NULL REFERENCES songs(id),
        position      INTEGER NOT NULL DEFAULT 0,
        is_current    INTEGER NOT NULL DEFAULT 0,
        played        INTEGER NOT NULL DEFAULT 0,
        added_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_queue_session ON queue(session_id, position);

      -- Lyrics (plain text per song)
      CREATE TABLE IF NOT EXISTS lyrics (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id       INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
        text          TEXT NOT NULL DEFAULT '',
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Sync cues (timestamps for lyrics lines)
      CREATE TABLE IF NOT EXISTS sync_cues (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id       INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        line_index    INTEGER NOT NULL,
        time_ms       INTEGER NOT NULL,
        type          TEXT NOT NULL DEFAULT 'line'
      );
      CREATE INDEX IF NOT EXISTS idx_sync_cues_song ON sync_cues(song_id, time_ms);

      -- History (session-scoped log of played songs)
      CREATE TABLE IF NOT EXISTS history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        song_id       INTEGER NOT NULL REFERENCES songs(id),
        started_at    TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at   TEXT,
        position      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_history_session ON history(session_id);

      -- Settings (key-value store)
      CREATE TABLE IF NOT EXISTS settings (
        key           TEXT PRIMARY KEY,
        value         TEXT NOT NULL
      );

      -- Logs
      CREATE TABLE IF NOT EXISTS logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        level         TEXT NOT NULL DEFAULT 'info',
        source        TEXT NOT NULL DEFAULT 'system',
        message       TEXT NOT NULL,
        data          TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);

      -- Default settings
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('rocketshow_host', '127.0.0.1'),
        ('rocketshow_port', '8181'),
        ('polling_interval_ms', '500'),
        ('playback_mode', 'auto'),
        ('live_lock', '0'),
        ('stage_message', ''),
        ('prompter_font_size', '32');

      -- Migration tracking
      CREATE TABLE IF NOT EXISTS _migrations (
        version       INTEGER PRIMARY KEY,
        description   TEXT,
        applied_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
};
