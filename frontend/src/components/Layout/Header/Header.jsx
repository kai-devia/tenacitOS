import styles from './Header.module.css';
import LiveBadge from './LiveBadge';

export default function Header({ isConnected, onMenuClick, showMenuButton }) {
  return (
    <header className={styles.header}>
      {showMenuButton && (
        <button className={styles.menuButton} onClick={onMenuClick} aria-label="Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      )}
      <div className={styles.title}>
        <span className={styles.logo}>🧠</span>
        <span className={styles.text}>KAI DOC</span>
      </div>
      <LiveBadge isConnected={isConnected} />
    </header>
  );
}
