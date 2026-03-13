const { getDb, closeDb } = require('../core/database');
const fs = require('fs');
const path = require('path');

function runMigrations() {
  const db = getDb();

  // Ensure _migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get current version
  const row = db.prepare('SELECT MAX(version) as v FROM _migrations').get();
  const currentVersion = row?.v || 0;

  // Load migration files
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.match(/^\d{3}_.*\.js$/) && f !== 'run.js')
    .sort();

  let applied = 0;

  for (const file of files) {
    const migration = require(path.join(migrationsDir, file));
    if (migration.version > currentVersion) {
      console.log(`[migrate] Applying migration ${migration.version}: ${migration.description}`);

      const runInTransaction = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)').run(
          migration.version,
          migration.description
        );
      });

      runInTransaction();
      applied++;
    }
  }

  if (applied === 0) {
    console.log('[migrate] Database is up to date.');
  } else {
    console.log(`[migrate] Applied ${applied} migration(s).`);
  }

  return applied;
}

// If run directly
if (require.main === module) {
  runMigrations();
  closeDb();
}

module.exports = { runMigrations };
