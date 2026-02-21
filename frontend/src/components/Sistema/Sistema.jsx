import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../../api/client';
import styles from './Sistema.module.css';

const API_BASE = '/api';
const REFRESH_INTERVAL = 5000;

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function mbToGb(mb) { return (mb / 1024).toFixed(1); }

function shortModel(name) {
  if (!name) return '';
  return name
    .replace(/\(R\)|\(TM\)/gi, '').replace(/CPU|Processor/gi, '')
    .replace(/with Radeon.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 28);
}

function fmtModel(m) {
  if (!m) return m;
  return m.replace('claude-', '').replace(/-(\d)/g, ' $1').replace(/-/g, ' ');
}

function fmtK(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

function ProgressBar({ percent, color }) {
  const c = color || (
    percent >= 85 ? 'var(--danger)' :
    percent >= 60 ? 'var(--warning)' :
    'var(--success)'
  );
  return (
    <div className={styles.trackThin}>
      <div className={styles.fill}
        style={{ width: `${Math.min(percent, 100)}%`, background: c }} />
    </div>
  );
}

function CompactCard({ label, value, sub, percent }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.cardValue}>{value}</div>
      {sub && <div className={styles.cardSub}>{sub}</div>}
      {percent !== undefined && <ProgressBar percent={percent} />}
    </div>
  );
}

// ── Claude limits editor ───────────────────────────────────────────────────
function ClaudeWebLimits({ limits, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    session_pct: limits?.session_pct ?? 0,
    weekly_all_pct: limits?.weekly_all_pct ?? 0,
    weekly_sonnet_pct: limits?.weekly_sonnet_pct ?? 0,
    session_resets_in: limits?.session_resets_in ?? '',
    weekly_resets_at: limits?.weekly_resets_at ?? '',
  });

  useEffect(() => {
    setForm({
      session_pct: limits?.session_pct ?? 0,
      weekly_all_pct: limits?.weekly_all_pct ?? 0,
      weekly_sonnet_pct: limits?.weekly_sonnet_pct ?? 0,
      session_resets_in: limits?.session_resets_in ?? '',
      weekly_resets_at: limits?.weekly_resets_at ?? '',
    });
  }, [limits]);

  const handleSave = async () => {
    await onSave(form);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={styles.claudeEditor}>
        <div className={styles.editorTitle}>Actualizar desde claude.ai/settings</div>
        <div className={styles.editorHint}>
          Al introducir el % semanal, el sistema calcula automáticamente el límite total estimado usando los tokens acumulados.
        </div>

        <div className={styles.editorGrid}>
          <div className={styles.editorField}>
            <label>Sesión %</label>
            <input type="number" min="0" max="100" value={form.session_pct}
              onChange={e => setForm(f => ({ ...f, session_pct: +e.target.value }))} />
          </div>
          <div className={styles.editorField}>
            <label>Se restablece en</label>
            <input type="text" placeholder="ej. 4h 48min" value={form.session_resets_in}
              onChange={e => setForm(f => ({ ...f, session_resets_in: e.target.value }))} />
          </div>
          <div className={styles.editorField}>
            <label>Semana — todos %</label>
            <input type="number" min="0" max="100" value={form.weekly_all_pct}
              onChange={e => setForm(f => ({ ...f, weekly_all_pct: +e.target.value }))} />
          </div>
          <div className={styles.editorField}>
            <label>Solo Sonnet %</label>
            <input type="number" min="0" max="100" value={form.weekly_sonnet_pct}
              onChange={e => setForm(f => ({ ...f, weekly_sonnet_pct: +e.target.value }))} />
          </div>
          <div className={styles.editorField}>
            <label>Semana se restablece</label>
            <input type="text" placeholder="ej. jue 17:59" value={form.weekly_resets_at}
              onChange={e => setForm(f => ({ ...f, weekly_resets_at: e.target.value }))} />
          </div>
        </div>

        <div className={styles.editorActions}>
          <button className={styles.cancelEditorBtn} onClick={() => setEditing(false)}>Cancelar</button>
          <button className={styles.saveEditorBtn} onClick={handleSave}>Guardar y calibrar</button>
        </div>
      </div>
    );
  }

  const hasData = limits?.updated_at;

  return (
    <div className={styles.claudeWebSection}>
      <div className={styles.claudeWebHeader}>
        <span className={styles.claudeWebTitle}>Claude.ai — Límites de plan</span>
        <button className={styles.updateBtn} onClick={() => setEditing(true)}>
          Actualizar
        </button>
      </div>

      {!hasData ? (
        <p className={styles.noData}>Sin datos — pulsa Actualizar e introduce los % de claude.ai/settings</p>
      ) : (
        <>
          {/* Sesión */}
          <div className={styles.limitRow}>
            <div className={styles.limitRowTop}>
              <span className={styles.limitLabel}>Sesión actual</span>
              <span className={styles.limitPct}>{limits.session_pct}%</span>
            </div>
            <ProgressBar percent={limits.session_pct} />
            {limits.session_resets_in && (
              <span className={styles.limitSub}>Se restablece en {limits.session_resets_in}</span>
            )}
          </div>

          {/* Semana — todos los modelos */}
          <div className={styles.limitRow}>
            <div className={styles.limitRowTop}>
              <span className={styles.limitLabel}>Semana — todos los modelos</span>
              <span className={styles.limitPct}>{limits.weekly_all_pct}%</span>
            </div>
            <ProgressBar percent={limits.weekly_all_pct} />
          </div>

          {/* Semana — Sonnet */}
          <div className={styles.limitRow}>
            <div className={styles.limitRowTop}>
              <span className={styles.limitLabel}>Semana — solo Sonnet</span>
              <span className={styles.limitPct}>{limits.weekly_sonnet_pct}%</span>
            </div>
            <ProgressBar percent={limits.weekly_sonnet_pct} />
            {limits.weekly_resets_at && (
              <span className={styles.limitSub}>Se restablece {limits.weekly_resets_at}</span>
            )}
          </div>

          <span className={styles.limitUpdated}>Actualizado {timeAgo(limits.updated_at)}</span>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Sistema() {
  const [metrics, setMetrics]   = useState(null);
  const [claude, setClaude]     = useState(null);
  const [webLimits, setWebLimits] = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  }), []);

  const fetchAll = useCallback(async () => {
    try {
      const [mRes, cRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/system/metrics`,       { headers: headers() }),
        fetch(`${API_BASE}/system/claude-usage`,  { headers: headers() }),
        fetch(`${API_BASE}/system/claude-web-limits`, { headers: headers() }),
      ]);
      if (!mRes.ok) throw new Error('Error cargando métricas');
      setMetrics(await mRes.json());
      if (cRes.ok) setClaude(await cRes.json());
      if (wRes.ok) setWebLimits(await wRes.json());
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const saveLimits = async (data) => {
    await fetch(`${API_BASE}/system/claude-web-limits`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    });
    await fetchAll();
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) return <div className={styles.centered}><div className={styles.spinner} /></div>;
  if (error) return (
    <div className={styles.centered}>
      <p className={styles.errorText}>{error}</p>
      <button className={styles.retryBtn} onClick={fetchAll}>Reintentar</button>
    </div>
  );

  const { cpu, memory, disk, uptime, hostname } = metrics;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.hostname}>{hostname}</span>
        {lastUpdated && (
          <span className={styles.lastUpdated}>{lastUpdated.toLocaleTimeString('es-ES')}</span>
        )}
      </div>

      {/* Grid 2x2 sistema */}
      <div className={styles.grid}>
        <CompactCard label="CPU" value={`${cpu.usage}%`}
          sub={`${cpu.cores} núcleos · ${shortModel(cpu.model)}`} percent={cpu.usage} />
        <CompactCard label="RAM" value={`${mbToGb(memory.used)} / ${mbToGb(memory.total)} GB`}
          sub={`${memory.percent}% en uso`} percent={memory.percent} />
        <CompactCard label="Disco" value={`${disk.used} / ${disk.total} GB`}
          sub={`${disk.free} GB libres`} percent={disk.percent} />
        <CompactCard label="Uptime" value={formatUptime(uptime)} sub="tiempo activo" />
      </div>

      {/* Claude.ai limits (manual) */}
      <ClaudeWebLimits limits={webLimits} onSave={saveLimits} />

      {/* OpenClaw API tokens */}
      {claude && (
        <div className={styles.claudeApiSection}>
          <div className={styles.claudeApiHeader}>
            <span className={styles.sectionLabel}>OpenClaw — tokens API</span>
            {claude.models?.length > 0 && (
              <div className={styles.claudeModels}>
                {claude.models.map(m => (
                  <span key={m} className={styles.modelChip}>{fmtModel(m)}</span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.claudeApiRow}>
            <div className={styles.apiStat}>
              <span className={styles.apiVal}>{fmtK(claude.session?.outputTokens || 0)}</span>
              <span className={styles.apiLbl}>sesión salida</span>
            </div>
            <div className={styles.apiStat}>
              <span className={styles.apiVal}>{fmtK(claude.today?.total || 0)}</span>
              <span className={styles.apiLbl}>hoy total</span>
            </div>
            <div className={styles.apiStat}>
              <span className={styles.apiVal}>{fmtK(claude.week?.total || 0)}</span>
              <span className={styles.apiLbl}>semana total</span>
            </div>
          </div>

          {/* Semana calibrada */}
          {claude.week?.limit && (
            <div className={styles.calibratedWeek}>
              <div className={styles.limitRowTop}>
                <span className={styles.limitLabel}>Semana estimada</span>
                <span className={styles.limitPct}>{claude.week.percent ?? 0}% <span className={styles.approx}>aprox.</span></span>
              </div>
              <ProgressBar percent={claude.week.percent || 0} />
              <span className={styles.limitSub}>
                {fmtK(claude.week.total)} de ~{fmtK(claude.week.limit)} tokens estimados
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
