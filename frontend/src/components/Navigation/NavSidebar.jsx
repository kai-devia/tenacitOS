import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Monitor, MessageSquare, CheckSquare, Activity, Brain, Lock } from 'lucide-react';
import styles from './NavSidebar.module.css';

const NAV_ITEMS = [
  { to: '/sistema', icon: Monitor,       label: 'Sistema' },
  { to: '/chat',    icon: MessageSquare, label: 'Chat' },
  { to: '/tasks',   icon: CheckSquare,   label: 'Tasks' },
  { to: '/pulse',   icon: Activity,      label: 'Pulse' },
  { to: '/mente',   icon: Brain,         label: 'Mente' },
  { to: '/vault',   icon: Lock,          label: 'Vault' },
];

export default function NavSidebar({ collapsed, onToggle }) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* Logo / Toggle button */}
      <button
        className={styles.logoBtn}
        onClick={onToggle}
        title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        aria-label="Toggle navigation"
      >
        <img src="/kai-avatar.svg" alt="KAI" width="28" height="28" className={styles.logo} />
        {!collapsed && <span className={styles.logoText}>KAI</span>}
      </button>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <span className={styles.icon}>
              <Icon size={18} strokeWidth={1.5} />
            </span>
            {!collapsed && <span className={styles.label}>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
