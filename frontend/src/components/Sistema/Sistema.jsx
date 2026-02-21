import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../../api/client';
import MetricCard from './MetricCard';
import styles from './Sistema.module.css';

const API_BASE = '/api';
const REFRESH_INTERVAL = 5000; // 5 seconds

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function mbToGb(mb) {
  return (mb / 1024).toFixed(1);
}

function shortModel(model) {
  if (!model) return 'Unknown';
  // Shorten very long CPU model names
  return model.replace(/\(R\)|\(TM\)/gi, '').replace(/CPU/gi, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

export default function Sistema() {
  const [metrics, setMetrics] = useState(null);
  const [subagents, setSubagents] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [metricsRes, subagentsRes] = await Promise.all([
        fetch(`${API_BASE}/system/metrics`, { headers }),
        fetch(`${API_BASE}/system/subagents`, { headers }),
      ]);

      if (!metricsRes.ok) throw new Error('Error fetching metrics');

      const metricsData = await metricsRes.json();
      const subagentsData = subagentsRes.ok ? await subagentsRes.json() : { count: 0 };

      setMetrics(metricsData);
      setSubagents(subagentsData.count || 0);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} />
        <p>Cargando métricas del sistema...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorText}>⚠️ {error}</p>
        <button className={styles.retryBtn} onClick={fetchMetrics}>Reintentar</button>
      </div>
    );
  }

  const { cpu, memory, disk, uptime, hostname } = metrics;
  const ramUsedGb = mbToGb(memory.used);
  const ramTotalGb = mbToGb(memory.total);

  return (
    <div className={styles.wrapper}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>🖥️ Sistema</h1>
          <p className={styles.hostname}>{hostname}</p>
        </div>
        {lastUpdated && (
          <span className={styles.lastUpdated}>
            Actualizado: {lastUpdated.toLocaleTimeString('es-ES')}
          </span>
        )}
      </div>

      <div className={styles.grid}>
        {/* CPU */}
        <MetricCard
          icon="⚡"
          title="CPU"
          value={`${cpu.usage}%`}
          sub={`${cpu.cores} núcleos · ${shortModel(cpu.model)}`}
          percent={cpu.usage}
        />

        {/* RAM */}
        <MetricCard
          icon="🧮"
          title="Memoria RAM"
          value={`${ramUsedGb} GB / ${ramTotalGb} GB`}
          sub={`${memory.percent}% en uso`}
          percent={memory.percent}
        />

        {/* Disk */}
        <MetricCard
          icon="💾"
          title="Disco"
          value={`${disk.used} GB / ${disk.total} GB`}
          sub={`${disk.percent}% usado · ${disk.free} GB libres`}
          percent={disk.percent}
        />

        {/* Uptime */}
        <MetricCard
          icon="⏱️"
          title="Uptime"
          value={formatUptime(uptime)}
          sub="Tiempo activo del sistema"
        />

        {/* Subagentes */}
        <MetricCard
          icon="🤖"
          title="Subagentes"
          value={`${subagents} activo${subagents !== 1 ? 's' : ''}`}
          sub="Procesos OpenClaw en ejecución"
        />
      </div>
    </div>
  );
}
