/**
 * Migration 004 — Tag rule templates.
 *
 * Stores reusable tag-rule models locally in ShowMaster.
 * Each template contains optional tag restrictions and an optional tag order.
 * Templates are applied to Jukebox sessions via a proxy call.
 */
module.exports = {
  version: 4,
  description: 'Create tag_templates and tag_template_rules tables',

  up(db) {
    db.exec(`
      CREATE TABLE tag_templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL UNIQUE,
        tag_order     TEXT,
        order_mode    TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE tag_template_rules (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id   INTEGER NOT NULL REFERENCES tag_templates(id) ON DELETE CASCADE,
        tag           TEXT    NOT NULL,
        hidden        INTEGER NOT NULL DEFAULT 0,
        max_total     INTEGER,
        max_pending   INTEGER,
        visible_from  TEXT,
        visible_until TEXT,
        hide_when_full INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_ttr_template ON tag_template_rules(template_id);
    `);
  }
};
