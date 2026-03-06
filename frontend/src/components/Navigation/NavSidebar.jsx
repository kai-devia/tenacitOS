import { useContext, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Monitor, MessageSquare, CheckSquare, Activity, Brain, Lock, FolderOpen } from 'lucide-react';
import { AgentContext } from '../../context/AgentContext';
import styles from './NavSidebar.module.css';

const NAV_ITEMS = [
  { to: '/sistema',   icon: Monitor,       label: 'Sistema'   },
  { to: '/chat',      icon: MessageSquare, label: 'Chat'      },
  { to: '/tasks',     icon: CheckSquare,   label: 'Tasks'     },
  { to: '/pulse',     icon: Activity,      label: 'Pulse'     },
  { to: '/mente',     icon: Brain,         label: 'Mente'     },
  { to: '/proyectos', icon: FolderOpen,    label: 'Proyectos' },
  { to: '/vault',     icon: Lock,          label: 'Vault'     },
];

export default function NavSidebar({ collapsed, onToggle }) {
  const { agentId, agentName, setAgent, agents } = useContext(AgentContext);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Helper to check if current route is allowed for an agent
  const isRouteAllowedForAgent = (newAgentName) => {
    const currentPath = location.pathname;
    const currentItem = NAV_ITEMS.find(item => currentPath.startsWith(item.to));
    if (!currentItem) return true; // Unknown route, allow
    if (!currentItem.onlyFor) return true; // No restriction
    return currentItem.onlyFor.includes(newAgentName);
  };

  // Handle agent change with redirect logic
  const handleAgentChange = (newAgentId) => {
    const newAgent = agents.find(a => a.id === newAgentId);
    if (!newAgent) return;
    
    // Check if current route is allowed for new agent
    if (!isRouteAllowedForAgent(newAgent.name)) {
      navigate('/chat');
    }
    
    setAgent(newAgentId);
    setDropdownOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTriggerClick = () => {
    if (!dropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top,
        left: rect.right + 8, // 8px gap to the right of sidebar
      });
    }
    setDropdownOpen(o => !o);
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>

      {/* Logo section — clicking K or Kai always toggles */}
      <div className={styles.logoSection}>
        <button
          className={styles.logoBtn}
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label="Toggle navigation"
        >
          <img src="/kai-avatar.svg" alt="KAI" width="26" height="26" className={styles.logo} />
          {!collapsed && <span className={styles.logoText}>KaiOS</span>}
        </button>
      </div>

      {/* Selector de agente eliminado — agente único */}

      <nav className={styles.nav}>
        {NAV_ITEMS
          .map(({ to, icon: Icon, label }) => (
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
