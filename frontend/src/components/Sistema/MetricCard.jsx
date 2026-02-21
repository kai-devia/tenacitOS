import styles from './Sistema.module.css';

/**
 * ProgressBar — reusable bar with color based on percentage
 */
export function ProgressBar({ percent }) {
  const color =
    percent >= 85
      ? 'var(--danger)'
      : percent >= 60
      ? 'var(--warning)'
      : 'var(--success)';

  return (
    <div className={styles.progressTrack}>
      <div
        className={styles.progressFill}
        style={{ width: `${Math.min(percent, 100)}%`, background: color }}
      />
    </div>
  );
}

/**
 * MetricCard — generic card for a system metric
 */
export default function MetricCard({ icon, title, value, sub, percent, children }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{icon}</span>
        <span className={styles.cardTitle}>{title}</span>
      </div>
      <div className={styles.cardValue}>{value}</div>
      {sub && <div className={styles.cardSub}>{sub}</div>}
      {percent !== undefined && <ProgressBar percent={percent} />}
      {children}
    </div>
  );
}
