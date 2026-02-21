import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header/Header';
import NavSidebar from '../Navigation/NavSidebar';
import BottomNav from '../Navigation/BottomNav';
import { useFiles } from '../../hooks/useFiles';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../hooks/useToast';
import { logout } from '../../api/client';
import styles from './Layout.module.css';

export default function Layout() {
  const [navCollapsed, setNavCollapsed] = useState(true); // starts collapsed (icon-only)
  const { tree, files, refresh } = useFiles();
  const { toasts, success, info, error } = useToast();

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'file_changed') {
      info(`📝 ${msg.path} actualizado`);
      refresh();
    } else if (msg.type === 'file_added') {
      info(`➕ ${msg.path} creado`);
      refresh();
    } else if (msg.type === 'file_deleted') {
      info(`🗑️ ${msg.path} eliminado`);
      refresh();
    }
  }, [info, refresh]);

  const { isConnected } = useWebSocket(handleWsMessage);

  return (
    <div className={styles.layout}>
      {/* Main navigation sidebar (desktop) */}
      <NavSidebar
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed((v) => !v)}
      />

      {/* Right side: header + content */}
      <div className={styles.main}>
        <Header
          isConnected={isConnected}
          onLogout={logout}
        />

        <main className={styles.content}>
          <Outlet
            context={{
              files,
              tree,
              refresh,
              success,
              error,
              info,
              basePath: '',
            }}
          />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
