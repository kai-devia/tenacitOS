const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'kai_doc.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Migrations ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
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

  -- Acumulado diario de tokens de Claude
  CREATE TABLE IF NOT EXISTS claude_daily_usage (
    date          TEXT PRIMARY KEY,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0
  );

  -- Historial del chat PWA
  CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL,   -- 'user' | 'assistant'
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Último snapshot leído de sessions.json (para calcular deltas)
  CREATE TABLE IF NOT EXISTS claude_usage_snapshot (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    captured_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Límites manuales de claude.ai (el usuario los actualiza desde settings)
  CREATE TABLE IF NOT EXISTS claude_web_limits (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    session_pct              INTEGER NOT NULL DEFAULT 0,
    weekly_all_pct           INTEGER NOT NULL DEFAULT 0,
    weekly_sonnet_pct        INTEGER NOT NULL DEFAULT 0,
    session_resets_in        TEXT    DEFAULT '',
    weekly_resets_at         TEXT    DEFAULT '',
    estimated_weekly_limit   INTEGER DEFAULT NULL,
    calibrated_at            TEXT    DEFAULT NULL,
    updated_at               TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Runtime migrations (ALTER TABLE para columnas añadidas después) ──────
const alterMigrations = [
  `ALTER TABLE claude_web_limits ADD COLUMN estimated_weekly_limit INTEGER DEFAULT NULL`,
  `ALTER TABLE claude_web_limits ADD COLUMN calibrated_at TEXT DEFAULT NULL`,
  `ALTER TABLE claude_web_limits ADD COLUMN session_expired INTEGER DEFAULT 0`,
  `ALTER TABLE claude_web_limits ADD COLUMN session_key TEXT DEFAULT NULL`,
  // Vault PIN storage
  `CREATE TABLE IF NOT EXISTS vault_config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash   TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];
for (const sql of alterMigrations) {
  try { db.exec(sql); } catch { /* column already exists — ignore */ }
}

// ─── Cleanup ───────────────────────────────────────────────────────────────
db.prepare("DELETE FROM otp_codes WHERE expires_at < datetime('now')").run();

// ─── Seed ──────────────────────────────────────────────────────────────────
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

console.log(`✅ SQLite ready at ${dbPath}`);

module.exports = db;
