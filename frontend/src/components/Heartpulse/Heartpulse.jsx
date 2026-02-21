import { useState } from 'react';
import TasksBoard from '../Tasks/TasksBoard';
import EventsPanel from '../Events/EventsPanel';
import styles from './Heartpulse.module.css';

const TABS = [
  { id: 'tasks',  icon: '📋', label: 'Tareas' },
  { id: 'pulsos', icon: '⚡', label: 'Pulsos' },
];

export default function Heartpulse() {
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <div className={styles.wrapper}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.activeTab : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <span className={styles.tabIcon}>{icon}</span>
            <span className={styles.tabLabel}>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.content}>
        {activeTab === 'tasks'  && <TasksBoard />}
        {activeTab === 'pulsos' && <EventsPanel />}
      </div>
    </div>
  );
}
