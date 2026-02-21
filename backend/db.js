const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Data directory — uses /app/data in Docker (mounted volume), or ./data in dev
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'kai_doc.db');
const db = new Database(dbPath);

// WAL mode for better write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Migrations ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL DEFAULT 'guille',
    credential_id TEXT  NOT NULL UNIQUE,
    public_key  TEXT    NOT NULL,
    counter     INTEGER NOT NULL DEFAULT 0,
    device_type TEXT    DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL DEFAULT 'guille',
    challenge   TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'BACKLOG',
    priority    TEXT    DEFAULT 'Medio',
    effort      TEXT    DEFAULT 'Medio',
    task_type   TEXT    DEFAULT '',
    project     TEXT    DEFAULT '',
    assignee    TEXT    DEFAULT '',
    started_at  TEXT,
    finished_at TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'FINALIZADO',
    owner       TEXT    DEFAULT 'Kai',
    notify      TEXT    DEFAULT 'NO',
    schedule    TEXT    DEFAULT '',
    last_run    TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Column migrations (safe — ignores if column already exists) ─────────
const runMigration = (sql) => {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
};
runMigration('ALTER TABLE webauthn_challenges ADD COLUMN rp_id TEXT DEFAULT "localhost"');
runMigration('ALTER TABLE webauthn_challenges ADD COLUMN origin TEXT DEFAULT "http://localhost"');
runMigration('ALTER TABLE webauthn_credentials ADD COLUMN rp_id TEXT DEFAULT "localhost"');

// ─── Seed initial events if table is empty ────────────────────────────────
const eventsCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
if (eventsCount.count === 0) {
  db.prepare(`
    INSERT INTO events (name, description, status, owner, notify, schedule)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'Revisar Registro de Tareas',
    'Revisar tareas en LISTO PARA EMPEZAR asignadas a Kai y ejecutarlas',
    'FINALIZADO',
    'Kai',
    'NO',
    'cada 30 min'
  );
  console.log('📦 DB seeded: initial event created');
}

console.log(`✅ SQLite database ready at ${dbPath}`);

module.exports = db;
