import styles from './LiveBadge.module.css';

export default function LiveBadge({ isConnected }) {
  return (
    <div className={`${styles.badge} ${isConnected ? styles.connected : styles.disconnected}`}>
      <span className={styles.dot}></span>
      <span className={styles.text}>{isConnected ? 'En vivo' : 'Desconectado'}</span>
    </div>
  );
}
