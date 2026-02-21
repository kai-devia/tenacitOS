const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const router = express.Router();

// ── Claude limits (Max subscription approximations)
// Output tokens per 5h session: ~50k on Max plan
// Output tokens per week: ~500k on Max plan
// Guille puede ajustar estos valores
const CLAUDE_LIMITS = {
  sessionOutputTokens: 50_000,   // tokens salida por sesión (5h)
  weeklyOutputTokens: 500_000,  // tokens salida por semana
};

// ── CPU: usar delta entre lecturas de /proc/stat ───────────────────────────
let _prevCpuStat = null;

function readProcStat() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const vals = line.trim().split(/\s+/).slice(1).map(Number);
  // user, nice, system, idle, iowait, irq, softirq, steal, ...
  const idle  = (vals[3] || 0) + (vals[4] || 0); // idle + iowait
  const total = vals.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function getCpu() {
  try {
    const curr = readProcStat();
    let usage = 0;

    if (_prevCpuStat) {
      const dIdle  = curr.idle  - _prevCpuStat.idle;
      const dTotal = curr.total - _prevCpuStat.total;
      usage = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 1000) / 10 : 0;
      usage = Math.min(100, Math.max(0, usage));
    }
    _prevCpuStat = curr;

    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/);
    const coreCount  = (cpuinfo.match(/^processor/gm) || []).length;

    return {
      usage,
      model: modelMatch ? modelMatch[1].trim() : 'Unknown',
      cores: coreCount,
    };
  } catch {
    return { usage: 0, model: 'Unknown', cores: 0 };
  }
}

// ── Disk: usar el volumen montado /workspace (apunta al host) ─────────────
function getDiskUsage() {
  try {
    const physicalGb = parseInt(process.env.PHYSICAL_DISK_GB || '0', 10);

    // BusyBox-compatible: df -B1 -P (POSIX)
    // Columns: Filesystem, 1-blocks(total), Used, Available, Capacity%, Mountpoint
    const raw = execSync('df -B1 -P /workspace', { timeout: 5000 })
      .toString().split('\n');
    const parts    = raw[1].trim().split(/\s+/);
    const usedBytes  = parseInt(parts[2], 10);
    const availBytes = parseInt(parts[3], 10);

    const usedGb  = Math.round(usedBytes / 1_073_741_824);
    const totalGb = physicalGb || Math.round((usedBytes + availBytes) / 1_073_741_824);
    const freeGb  = totalGb - usedGb;
    const percent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;

    return { used: usedGb, total: totalGb, free: freeGb, percent };
  } catch {
    return { used: 0, total: 0, free: 0, percent: 0 };
  }
}

// ── Memory ─────────────────────────────────────────────────────────────────
function getMemory() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)[1], 10) * 1024;
    const avail = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)[1], 10) * 1024;
    const used  = total - avail;
    return {
      total:   Math.round(total / 1_048_576),
      used:    Math.round(used  / 1_048_576),
      percent: Math.round((used / total) * 100),
    };
  } catch {
    return { total: 0, used: 0, percent: 0 };
  }
}

// ── Uptime ─────────────────────────────────────────────────────────────────
function getUptime() {
  try {
    return Math.floor(parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]));
  } catch {
    return 0;
  }
}

// ── Hostname ───────────────────────────────────────────────────────────────
function getHostname() {
  try {
    return execSync('hostname', { timeout: 3000 }).toString().trim();
  } catch {
    return 'unknown';
  }
}

// ── Claude usage — tracking con deltas + acumulado diario ─────────────────
function readSessionsFile() {
  const p = path.join(
    process.env.HOME || '/home/kai',
    '.openclaw/agents/main/sessions/sessions.json'
  );
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getClaudeUsage() {
  try {
    const sessions = readSessionsFile();
    if (!sessions) return null;

    const models = new Set();
    let currentIn  = 0;
    let currentOut = 0;
    let mainContextTokens = 0;
    let mainOut = 0;

    for (const [key, sess] of Object.entries(sessions)) {
      if (typeof sess !== 'object' || !sess) continue;
      currentIn  += sess.inputTokens  || 0;
      currentOut += sess.outputTokens || 0;
      if (sess.model) models.add(sess.model);
      if (key === 'agent:main:main') {
        mainContextTokens = sess.totalTokens  || 0;
        mainOut           = sess.outputTokens || 0;
      }
    }

    // ── Delta tracking ──────────────────────────────────────────────────
    const today    = new Date().toISOString().slice(0, 10);
    const snapshot = db.prepare('SELECT * FROM claude_usage_snapshot WHERE id = 1').get();
    const prevIn   = snapshot?.input_tokens  || 0;
    const prevOut  = snapshot?.output_tokens || 0;
    const deltaIn  = Math.max(0, currentIn  - prevIn);
    const deltaOut = Math.max(0, currentOut - prevOut);

    if (deltaIn > 0 || deltaOut > 0) {
      db.prepare(`
        INSERT INTO claude_daily_usage (date, input_tokens, output_tokens)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          input_tokens  = input_tokens  + excluded.input_tokens,
          output_tokens = output_tokens + excluded.output_tokens
      `).run(today, deltaIn, deltaOut);

      db.prepare(`
        INSERT INTO claude_usage_snapshot (id, input_tokens, output_tokens, captured_at)
        VALUES (1, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          captured_at  = excluded.captured_at
      `).run(currentIn, currentOut);
    }

    // ── Aggregates ──────────────────────────────────────────────────────
    const todayRow = db.prepare('SELECT * FROM claude_daily_usage WHERE date = ?').get(today);
    const weekRow  = db.prepare(`
      SELECT SUM(input_tokens) as in_sum, SUM(output_tokens) as out_sum
      FROM claude_daily_usage
      WHERE date >= date('now', '-6 days')
    `).get();

    const todayIn  = todayRow?.input_tokens  || 0;
    const todayOut = todayRow?.output_tokens || 0;
    const weekIn   = weekRow?.in_sum  || 0;
    const weekOut  = weekRow?.out_sum || 0;

    // ── Usar límite calibrado si existe ────────────────────────────────
    const webLimits = db.prepare('SELECT * FROM claude_web_limits WHERE id = 1').get();
    const calibratedWeeklyLimit = webLimits?.estimated_weekly_limit || null;
    const weekTotal = weekIn + weekOut;
    const weekPct = calibratedWeeklyLimit
      ? Math.min(100, Math.round((weekTotal / calibratedWeeklyLimit) * 100))
      : null;

    return {
      session: {
        contextTokens: mainContextTokens,
        outputTokens:  mainOut,
      },
      today: {
        inputTokens:  todayIn,
        outputTokens: todayOut,
        total:        todayIn + todayOut,
      },
      week: {
        inputTokens:  weekIn,
        outputTokens: weekOut,
        total:        weekTotal,
        limit:        calibratedWeeklyLimit,
        percent:      weekPct,
      },
      models: [...models],
      calibrated: !!calibratedWeeklyLimit,
    };
  } catch (err) {
    console.error('claude-usage error:', err.message);
    return null;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get('/metrics', (req, res) => {
  try {
    res.json({
      hostname: getHostname(),
      cpu:      getCpu(),
      memory:   getMemory(),
      disk:     getDiskUsage(),
      uptime:   getUptime(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subagents', (req, res) => {
  res.json({ count: 0 });
});

// ── claude.ai manual limits ────────────────────────────────────────────────
router.get('/claude-web-limits', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT session_pct, weekly_all_pct, weekly_sonnet_pct, session_resets_in, weekly_resets_at, updated_at, session_expired FROM claude_web_limits WHERE id = 1'
    ).get();
    res.json(row || {
      session_pct: 0, weekly_all_pct: 0, weekly_sonnet_pct: 0,
      session_resets_in: '', weekly_resets_at: '', updated_at: null, session_expired: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/claude-web-limits', (req, res) => {
  try {
    const { session_pct, weekly_all_pct, weekly_sonnet_pct, session_resets_in, weekly_resets_at } = req.body;

    // Auto-calibrate weekly token limit when weekly_all_pct is provided
    let estimated_weekly_limit = null;
    if (weekly_all_pct > 0) {
      // Sum all tracked tokens so far as the "tokens at X%" reference point
      const row = db.prepare(`
        SELECT SUM(input_tokens) + SUM(output_tokens) as total
        FROM claude_daily_usage
      `).get();
      const currentTokens = row?.total || 0;
      if (currentTokens > 0) {
        estimated_weekly_limit = Math.round(currentTokens / (weekly_all_pct / 100));
      }
    }

    db.prepare(`
      INSERT INTO claude_web_limits
        (id, session_pct, weekly_all_pct, weekly_sonnet_pct, session_resets_in, weekly_resets_at,
         estimated_weekly_limit, calibrated_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        session_pct              = excluded.session_pct,
        weekly_all_pct           = excluded.weekly_all_pct,
        weekly_sonnet_pct        = excluded.weekly_sonnet_pct,
        session_resets_in        = excluded.session_resets_in,
        weekly_resets_at         = excluded.weekly_resets_at,
        estimated_weekly_limit   = COALESCE(excluded.estimated_weekly_limit, claude_web_limits.estimated_weekly_limit),
        calibrated_at            = CASE WHEN excluded.estimated_weekly_limit IS NOT NULL THEN datetime('now') ELSE claude_web_limits.calibrated_at END,
        updated_at               = excluded.updated_at
    `).run(
      session_pct       ?? 0,
      weekly_all_pct    ?? 0,
      weekly_sonnet_pct ?? 0,
      session_resets_in || '',
      weekly_resets_at  || '',
      estimated_weekly_limit,
      estimated_weekly_limit,
    );

    res.json({ ok: true, estimated_weekly_limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Manual sync trigger → calls host sync-bridge ─────────────────────────
router.post('/sync-claude', async (req, res) => {
  try {
    const bridgeUrl = 'http://172.19.0.1:8766/sync';
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'x-sync-secret': 'kai-sync-secret-2026' },
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Bridge error: ${text}` });
    }
    const data = await response.json();

    // Mark session_expired in DB based on result
    if (data.error === 'SESSION_EXPIRED') {
      db.prepare(`
        INSERT INTO claude_web_limits (id, session_expired, updated_at)
        VALUES (1, 1, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET session_expired = 1
      `).run();
    } else if (data.ok) {
      db.prepare(`
        INSERT INTO claude_web_limits (id, session_expired, updated_at)
        VALUES (1, 0, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET session_expired = 0
      `).run();
    }

    res.json(data);
  } catch (err) {
    res.status(503).json({ error: `Cannot reach sync bridge: ${err.message}` });
  }
});

// ── Update sessionKey + trigger sync ─────────────────────────────────────
router.post('/claude-session-key', async (req, res) => {
  const { sessionKey } = req.body;
  if (!sessionKey || !sessionKey.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'sessionKey inválido' });
  }

  try {
    // Store in DB (accessible from both Docker and host via shared volume)
    db.prepare(`
      INSERT INTO claude_web_limits (id, session_key, session_expired, updated_at)
      VALUES (1, ?, 0, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        session_key = excluded.session_key,
        session_expired = 0
    `).run(sessionKey);

    // Trigger sync via bridge
    try {
      const bridgeRes = await fetch('http://172.19.0.1:8766/sync', {
        method: 'POST',
        headers: { 'x-sync-secret': 'kai-sync-secret-2026' },
      });
      const syncData = await bridgeRes.json();
      if (syncData.error === 'SESSION_EXPIRED') {
        db.prepare(`UPDATE claude_web_limits SET session_expired = 1 WHERE id = 1`).run();
      }
      res.json({ ok: true, sync: syncData });
    } catch {
      res.json({ ok: true, sync: null, note: 'Key guardada, sync pendiente' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/claude-usage', (req, res) => {
  try {
    const usage = getClaudeUsage();
    res.json(usage || {
      session: { contextTokens: 0, outputTokens: 0, limit: CLAUDE_LIMITS.sessionOutputTokens, percent: 0 },
      today:   { inputTokens: 0, outputTokens: 0, total: 0 },
      week:    { inputTokens: 0, outputTokens: 0, total: 0, limit: CLAUDE_LIMITS.weeklyOutputTokens, percent: 0 },
      models:  [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
