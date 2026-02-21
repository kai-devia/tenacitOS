const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../middlewares/auth');
const router = express.Router();

// Protect all vault routes with JWT auth
router.use(authMiddleware);

const SECRETS_FILE = process.env.VAULT_SECRETS_PATH || '/app/vault-secrets/accounts.env';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashPin(pin) {
  return crypto.createHash('sha256').update(`vault-kai-2026:${pin}`).digest('hex');
}

function getVaultConfig() {
  // Ensure table exists (idempotent)
  db.exec(`CREATE TABLE IF NOT EXISTS vault_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db.prepare('SELECT * FROM vault_config WHERE id = 1').get() || null;
}

/**
 * Parse .env file preserving structure (comments, blank lines, sections).
 * Returns array of { type: 'comment'|'blank'|'entry', key?, value?, raw }
 */
function parseEnvFile(content) {
  const lines = content.split('\n');
  const result = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      result.push({ type: 'blank', raw });
    } else if (trimmed.startsWith('#')) {
      result.push({ type: 'comment', raw, text: trimmed.slice(1).trim() });
    } else {
      const eqIdx = raw.indexOf('=');
      if (eqIdx > 0) {
        const key = raw.slice(0, eqIdx).trim();
        let value = raw.slice(eqIdx + 1);
        // Strip surrounding quotes
        const unquoted = value.replace(/^["']|["']$/g, '');
        result.push({ type: 'entry', key, value: unquoted, raw });
      } else {
        // Unrecognized line — keep as-is
        result.push({ type: 'blank', raw });
      }
    }
  }

  return result;
}

function maskValue(value) {
  if (!value || value.length <= 4) return '••••';
  return value.slice(0, 3) + '•'.repeat(Math.min(value.length - 3, 20));
}

function readSecretsFile() {
  if (!fs.existsSync(SECRETS_FILE)) return '';
  return fs.readFileSync(SECRETS_FILE, 'utf8');
}

function writeSecretsFile(content) {
  fs.writeFileSync(SECRETS_FILE, content, 'utf8');
}

function updateKeyInFile(key, newValue) {
  const content = readSecretsFile();
  const lines = content.split('\n');
  let found = false;

  const updated = lines.map(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && line.slice(0, eqIdx).trim() === key) {
      found = true;
      // Preserve quotes if value has spaces
      const needsQuotes = newValue.includes(' ');
      return `${key}=${needsQuotes ? `"${newValue}"` : newValue}`;
    }
    return line;
  });

  if (!found) {
    // Append new key
    updated.push(`${key}=${newValue}`);
  }

  writeSecretsFile(updated.join('\n'));
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/vault/status
 * Returns whether PIN is configured
 */
router.get('/status', (req, res) => {
  const config = getVaultConfig();
  res.json({ pinConfigured: !!(config && config.pin_hash) });
});

/**
 * POST /api/vault/setup-pin
 * Body: { pin: "1234" }
 * Sets PIN for the first time (or resets if no PIN was set)
 */
router.post('/setup-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN debe tener al menos 4 dígitos' });
  }

  const config = getVaultConfig();
  const pinHash = hashPin(String(pin));

  if (config) {
    db.prepare('UPDATE vault_config SET pin_hash = ? WHERE id = 1').run(pinHash);
  } else {
    db.prepare('INSERT INTO vault_config (id, pin_hash) VALUES (1, ?)').run(pinHash);
  }

  res.json({ ok: true });
});

/**
 * POST /api/vault/verify-pin
 * Body: { pin: "1234" }
 * Returns { valid: true/false }
 */
router.post('/verify-pin', (req, res) => {
  const { pin } = req.body;
  const config = getVaultConfig();
  if (!config || !config.pin_hash) {
    return res.status(400).json({ error: 'PIN no configurado' });
  }
  const valid = config.pin_hash === hashPin(String(pin));
  res.json({ valid });
});

/**
 * GET /api/vault/entries
 * Returns entries with masked values (no PIN required — list is safe to show)
 */
router.get('/entries', (req, res) => {
  const content = readSecretsFile();
  const parsed = parseEnvFile(content);

  const entries = parsed.map(item => {
    if (item.type === 'entry') {
      return { type: 'entry', key: item.key, masked: maskValue(item.value) };
    }
    return item;
  });

  res.json({ entries });
});

/**
 * POST /api/vault/reveal
 * Body: { key: "GITHUB_TOKEN", pin: "1234" }
 * Returns real value if PIN is correct
 */
router.post('/reveal', (req, res) => {
  const { key, pin } = req.body;
  if (!key || !pin) return res.status(400).json({ error: 'key y pin requeridos' });

  const config = getVaultConfig();
  if (!config || config.pin_hash !== hashPin(String(pin))) {
    return res.status(403).json({ error: 'PIN incorrecto' });
  }

  const content = readSecretsFile();
  const parsed = parseEnvFile(content);
  const entry = parsed.find(e => e.type === 'entry' && e.key === key);

  if (!entry) return res.status(404).json({ error: 'Clave no encontrada' });
  res.json({ key, value: entry.value });
});

/**
 * PATCH /api/vault/entries/:key
 * Body: { value: "new-value", pin: "1234" }
 * Updates a key in the secrets file
 */
router.patch('/entries/:key', (req, res) => {
  const { key } = req.params;
  const { value, pin } = req.body;

  if (!pin) return res.status(400).json({ error: 'PIN requerido' });
  if (value === undefined) return res.status(400).json({ error: 'value requerido' });

  const config = getVaultConfig();
  if (!config || config.pin_hash !== hashPin(String(pin))) {
    return res.status(403).json({ error: 'PIN incorrecto' });
  }

  try {
    updateKeyInFile(key, value);
    res.json({ ok: true, key, masked: maskValue(value) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
