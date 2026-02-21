import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Cpu, MemoryStick, HardDrive, Clock, Activity } from 'lucide-react';
import { getToken } from '../../api/client';
import styles from './Sistema.module.css';

const API_BASE = '/api';
const REFRESH_INTERVAL = 5000;

// ── Formatters ─────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  const days  = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins  = Math.floor((seconds % 3600) / 60);
  if (days > 0)  return `${days}d ${hours}h`;
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
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

// ── Progress bar ───────────────────────────────────────────────────────────
function Bar({ percent }) {
  const color =
    percent >= 85 ? 'var(--danger)'  :
    percent >= 60 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
    </div>
  );
}

// ── System metric card ─────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, percent }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricTop}>
        <Icon size={14} className={styles.metricIcon} />
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
      {percent !== undefined && <Bar percent={percent} />}
    </div>
  );
}

// ── Session renewal form ───────────────────────────────────────────────────
function SessionRenewal({ onRenew, renewing }) {
  const [key, setKey] = useState('');
  return (
    <div className={styles.renewalBox}>
      <div className={styles.renewalTitle}>Sesión de Claude.ai expirada</div>
      <div className={styles.renewalDesc}>
        Introduce el nuevo <code>sessionKey</code> para restablecer la conexión.
      </div>
      <input
        className={styles.renewalInput}
        type="text"
        placeholder="sk-ant-sid02-..."
        value={key}
        onChange={e => setKey(e.target.value)}
        spellCheck={false}
      />
      <button
        className={styles.renewalBtn}
        disabled={!key.startsWith('sk-ant-') || renewing}
        onClick={() => onRenew(key)}
      >
        {renewing ? 'Actualizando...' : 'Actualizar sesión'}
      </button>
      <p className={styles.renewalHint}>
        Para obtenerlo: abre <strong>claude.ai</strong> → F12 → Application → Cookies → claude.ai → copia el valor de <code>sessionKey</code>
      </p>
    </div>
  );
}

// ── Claude plan usage section ──────────────────────────────────────────────
function ClaudePlan({ limits, onSync, syncing, onRenew, renewing }) {
  const hasData   = limits?.updated_at;
  const isExpired = limits?.session_expired;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Claude.ai — Plan</span>
        <div className={styles.sectionActions}>
          {hasData && !isExpired && <span className={styles.syncBadge}>Auto-sync</span>}
          {isExpired && <span className={styles.expiredBadge}>Sesión expirada</span>}
          {!isExpired && (
            <button
              className={styles.syncBtn}
              onClick={onSync}
              disabled={syncing}
              title="Sincronizar ahora"
            >
              <RefreshCw size={13} className={syncing ? styles.spinning : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          )}
        </div>
      </div>

      {isExpired ? (
        <SessionRenewal onRenew={onRenew} renewing={renewing} />
      ) : !hasData ? (
        <p className={styles.noData}>Sincronizando por primera vez...</p>
      ) : (
        <div className={styles.limitsList}>
          {/* Sesión */}
          <div className={styles.limitItem}>
            <div className={styles.limitMeta}>
              <span className={styles.limitName}>Sesión actual</span>
              <span className={styles.limitPct}>{limits.session_pct}%</span>
            </div>
            <Bar percent={limits.session_pct} />
            {limits.session_resets_in && (
              <span className={styles.limitNote}>Resetea en {limits.session_resets_in}</span>
            )}
          </div>

          {/* Semana todos */}
          <div className={styles.limitItem}>
            <div className={styles.limitMeta}>
              <span className={styles.limitName}>Semana — todos los modelos</span>
              <span className={styles.limitPct}>{limits.weekly_all_pct}%</span>
            </div>
            <Bar percent={limits.weekly_all_pct} />
            {limits.weekly_resets_at && (
              <span className={styles.limitNote}>Resetea {limits.weekly_resets_at}</span>
            )}
          </div>

          {/* Sonnet */}
          <div className={styles.limitItem}>
            <div className={styles.limitMeta}>
              <span className={styles.limitName}>Semana — solo Sonnet</span>
              <span className={styles.limitPct}>{limits.weekly_sonnet_pct}%</span>
            </div>
            <Bar percent={limits.weekly_sonnet_pct} />
          </div>

          <span className={styles.updatedNote}>Actualizado {timeAgo(limits.updated_at)}</span>
        </div>
      )}
    </div>
  );
}

// ── OpenClaw token stats ───────────────────────────────────────────────────
function TokenStats({ claude }) {
  if (!claude) return null;
  const stats = [
    { label: 'Contexto sesión',   value: fmtK(claude.session?.contextTokens || 0) },
    { label: 'Salida sesión',     value: fmtK(claude.session?.outputTokens   || 0) },
    { label: 'Total hoy',         value: fmtK(claude.today?.total            || 0) },
    { label: 'Total semana',      value: fmtK(claude.week?.total             || 0) },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>OpenClaw — Tokens API</span>
        {claude.models?.length > 0 && (
          <div className={styles.modelChips}>
            {claude.models.map(m => (
              <span key={m} className={styles.chip}>{fmtModel(m)}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tokenGrid}>
        {stats.map(({ label, value }) => (
          <div key={label} className={styles.tokenStat}>
            <span className={styles.tokenVal}>{value}</span>
            <span className={styles.tokenLabel}>{label}</span>
          </div>
        ))}
      </div>

      {claude.week?.limit && (
        <div className={styles.weekBar}>
          <div className={styles.limitMeta}>
            <span className={styles.limitName}>Semana estimada</span>
            <span className={styles.limitPct}>{claude.week.percent ?? 0}% <em className={styles.approx}>aprox.</em></span>
          </div>
          <Bar percent={claude.week.percent || 0} />
          <span className={styles.limitNote}>
            {fmtK(claude.week.total)} de ~{fmtK(claude.week.limit)} tokens estimados
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Sistema() {
  const [metrics,    setMetrics]   = useState(null);
  const [claude,     setClaude]    = useState(null);
  const [webLimits,  setWebLimits] = useState(null);
  const [error,      setError]     = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [syncing,    setSyncing]   = useState(false);
  const [renewing,   setRenewing]  = useState(false);

  const auth = useCallback(() => ({
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  }), []);

  const fetchAll = useCallback(async () => {
    try {
      const [mRes, cRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/system/metrics`,           { headers: auth() }),
        fetch(`${API_BASE}/system/claude-usage`,      { headers: auth() }),
        fetch(`${API_BASE}/system/claude-web-limits`, { headers: auth() }),
      ]);
      if (!mRes.ok) throw new Error('Error cargando métricas');
      setMetrics(await mRes.json());
      if (cRes.ok) setClaude(await cRes.json());
      if (wRes.ok) setWebLimits(await wRes.json());
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/system/sync-claude`, {
        method: 'POST',
        headers: auth(),
      });
      if (res.ok) {
        await new Promise(r => setTimeout(r, 500));
        await fetchAll();
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleRenew = async (sessionKey) => {
    setRenewing(true);
    try {
      const res = await fetch(`${API_BASE}/system/claude-session-key`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ sessionKey }),
      });
      if (res.ok) {
        await new Promise(r => setTimeout(r, 1000));
        await fetchAll();
      }
    } catch (err) {
      console.error('Renew error:', err);
    } finally {
      setRenewing(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) return (
    <div className={styles.centered}>
      <div className={styles.spinner} />
    </div>
  );

  if (error) return (
    <div className={styles.centered}>
      <p className={styles.errorText}>{error}</p>
      <button className={styles.retryBtn} onClick={fetchAll}>Reintentar</button>
    </div>
  );

  const { cpu, memory, disk, uptime, hostname } = metrics;

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.hostname}>{hostname}</span>
        {lastUpdate && (
          <span className={styles.lastUpdated}>{lastUpdate.toLocaleTimeString('es-ES')}</span>
        )}
      </div>

      {/* System metrics grid */}
      <div className={styles.metricsGrid}>
        <MetricCard icon={Cpu}         label="CPU"    value={`${cpu.usage}%`}
          sub={`${cpu.cores} núcleos · ${shortModel(cpu.model)}`} percent={cpu.usage} />
        <MetricCard icon={MemoryStick} label="RAM"    value={`${mbToGb(memory.used)} / ${mbToGb(memory.total)} GB`}
          sub={`${memory.percent}% en uso`} percent={memory.percent} />
        <MetricCard icon={HardDrive}   label="Disco"  value={`${disk.used} / ${disk.total} GB`}
          sub={`${disk.free} GB libres`} percent={disk.percent} />
        <MetricCard icon={Clock}       label="Uptime" value={formatUptime(uptime)}
          sub="tiempo activo" />
      </div>

      {/* Claude.ai plan usage */}
      <ClaudePlan limits={webLimits} onSync={handleSync} syncing={syncing} onRenew={handleRenew} renewing={renewing} />

      {/* OpenClaw token stats */}
      <TokenStats claude={claude} />
    </div>
  );
}
