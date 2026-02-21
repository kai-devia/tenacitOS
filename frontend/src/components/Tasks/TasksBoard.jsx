import { useState, useEffect, useCallback } from 'react';
import { getTasks, createTask, updateTask, deleteTask } from '../../api/client';
import TaskModal from './TaskModal';
import styles from './Tasks.module.css';

const STATUSES = [
  'BACKLOG',
  'ANALIZANDO',
  'LISTO PARA EMPEZAR',
  'EN PROGRESO',
  'PARA REVISAR',
  'FINALIZADO',
];

// Order for visual sorting (most active first)
const STATUS_ORDER = {
  'EN PROGRESO': 0,
  'PARA REVISAR': 1,
  'LISTO PARA EMPEZAR': 2,
  ANALIZANDO: 3,
  BACKLOG: 4,
  FINALIZADO: 5,
};

const STATUS_STYLES = {
  BACKLOG:              { bg: '#33333322', color: '#888',        border: '#44444444' },
  ANALIZANDO:           { bg: '#00d4aa22', color: 'var(--accent)', border: '#00d4aa44' },
  'LISTO PARA EMPEZAR': { bg: '#06b6d422', color: '#22d3ee',    border: '#06b6d444' },
  'EN PROGRESO':        { bg: '#f59e0b22', color: '#fbbf24',    border: '#f59e0b44' },
  'PARA REVISAR':       { bg: '#ec489922', color: '#f472b6',    border: '#ec489944' },
  FINALIZADO:           { bg: '#4ade8022', color: 'var(--success)', border: '#4ade8044' },
};

const PRIORITY_STYLES = {
  Alta:  { color: 'var(--danger)' },
  Medio: { color: 'var(--warning)' },
  Baja:  { color: 'var(--success)' },
};

function Badge({ value, styleMap }) {
  const s = styleMap[value] || { bg: '#33333322', color: '#888', border: '#44444444' };
  return (
    <span className={styles.badge} style={{ background: s.bg, color: s.color, borderColor: s.border }}>
      {value}
    </span>
  );
}

function PriorityDot({ priority }) {
  const s = PRIORITY_STYLES[priority] || { color: '#888' };
  return <span className={styles.priorityDot} style={{ background: s.color }} title={priority} />;
}

export default function TasksBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('Todas');
  const [modal, setModal] = useState(null); // null | { task?, initialStatus? }

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getTasks();
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (modal?.task) {
      const updated = await updateTask(modal.task.id, form);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } else {
      const created = await createTask(form);
      setTasks((prev) => [created, ...prev]);
    }
    setModal(null);
  };

  const handleDelete = async (id) => {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setModal(null);
  };

  const filters = ['Todas', ...STATUSES];
  const filtered = tasks
    .filter((t) => filter === 'Todas' || t.status === filter)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  if (loading) return <div className={styles.centered}><div className={styles.spinner} /><p>Cargando...</p></div>;
  if (error) return <div className={styles.centered}><p className={styles.errorText}>⚠️ {error}</p><button className={styles.retryBtn} onClick={load}>Reintentar</button></div>;

  return (
    <div className={styles.listWrapper}>
      {/* Header */}
      <div className={styles.listHeader}>
        <h1 className={styles.listTitle}>📋 Tareas</h1>
        <button className={styles.newBtn} onClick={() => setModal({ task: null, initialStatus: 'BACKLOG' })}>
          + Nueva
        </button>
      </div>

      {/* Filter chips */}
      <div className={styles.filterRow}>
        {filters.map((f) => (
          <button
            key={f}
            className={`${styles.filterChip} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'Todas' ? 'Todas' : (f.length > 10 ? f.split(' ').pop() : f)}
            {f !== 'Todas' && (
              <span className={styles.chipCount}>
                {tasks.filter((t) => t.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No hay tareas{filter !== 'Todas' ? ` en "${filter}"` : ''}.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {filtered.map((task) => {
            const ss = STATUS_STYLES[task.status] || STATUS_STYLES.BACKLOG;
            return (
              <li
                key={task.id}
                className={styles.listItem}
                onClick={() => setModal({ task })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setModal({ task })}
              >
                <PriorityDot priority={task.priority} />
                <div className={styles.itemMain}>
                  <span className={styles.itemId}>#{task.id}</span>
                  <span className={styles.itemTitle}>{task.title}</span>
                  {task.project && <span className={styles.itemProject}>{task.project}</span>}
                </div>
                <span
                  className={styles.statusChip}
                  style={{ background: ss.bg, color: ss.color, borderColor: ss.border }}
                >
                  {task.status.length > 10 ? task.status.split(' ').pop() : task.status}
                </span>
                <span className={styles.chevron}>›</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Total count */}
      {filtered.length > 0 && (
        <p className={styles.totalCount}>{filtered.length} tarea{filtered.length !== 1 ? 's' : ''}</p>
      )}

      {/* Modal */}
      {modal !== null && (
        <TaskModal
          task={modal.task}
          initialStatus={modal.initialStatus}
          onSave={handleSave}
          onClose={() => setModal(null)}
          onDelete={modal.task ? () => handleDelete(modal.task.id) : null}
        />
      )}
    </div>
  );
}
