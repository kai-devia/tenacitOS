import styles from './Header.module.css';
import LiveBadge from './LiveBadge';
import { useAuth } from '../../../hooks/useAuth';

export default function Header({ isConnected, onLogout }) {
  const { logout } = useAuth();

  const handleLogout = onLogout || logout;

  return (
    <header className={styles.header}>
      {/* KAI title — only visible on mobile (desktop uses NavSidebar logo) */}
      <div className={styles.title}>
        <img src="/kai-avatar.svg" alt="KAI" className={styles.logo} width="24" height="24" />
        <span className={styles.text}>KAI</span>
      </div>

      <div className={styles.actions}>
        <LiveBadge isConnected={isConnected} />
        <button
          className={styles.logoutBtn}
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
