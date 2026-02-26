import { useState, useContext } from 'react';
import { Outlet, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { AgentContext } from '../../context/AgentContext';
import FileTree from '../Layout/Sidebar/FileTree';
import SearchBar from '../Layout/Sidebar/SearchBar';
import styles from './Mente.module.css';

export default function Mente() {
  // Get agent context
  const { agentId, agentEmoji, agentName } = useContext(AgentContext);

  // Inherit everything from Layout's outlet context
  const parentContext = useOutletContext() || {};
  const { tree, files, refresh, success, info, error } = parentContext;

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({ memory: true, 'memory/contexts': true });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname.startsWith('/mente/file/')
    ? decodeURIComponent(location.pathname.slice('/mente/file/'.length))
    : null;

  const handleFileClick = (path) => {
    navigate(`/mente/file/${encodeURIComponent(path)}`);
    setSidebarOpen(false);
  };

  const toggleExpand = (path) =>
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));

  // Pass down to nested routes (Dashboard, MarkdownView, Editor)
  const outletContext = {
    files,
    tree,
    refresh,
    success,
    info,
    error,
    basePath: '/mente',
    agentId,
    agentName,
    agentEmoji,
  };

  return (
    <div className={styles.wrapper}>
      {/* Mobile toggle button */}
      <button
        className={styles.mobileToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle árbol de archivos"
      >
        {sidebarOpen ? '✕' : '📂'} Archivos
      </button>

      {/* Overlay for mobile drawer */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* File tree sidebar (left panel) */}
      <aside className={`${styles.treeSidebar} ${sidebarOpen ? styles.treeOpen : ''}`}>
        <div className={styles.treeHeader}>
          <span className={styles.treeTitle}>🧠 Contexto</span>
          <div className={styles.treeHeaderActions}>
            <button
              title="Nuevo archivo en raíz"
              onClick={() => setExpanded(prev => ({ ...prev }))}
              className={styles.treeHeaderBtn}
            >
              <i className="fa fa-file-o" />
            </button>
            <button
              title="Actualizar"
              onClick={refresh}
              className={styles.treeHeaderBtn}
            >
              <i className="fa fa-refresh" />
            </button>
          </div>
        </div>
        <div className={styles.searchWrap}>
          <SearchBar value={search} onChange={setSearch} />
        </div>
        <nav className={styles.treeNav}>
          <FileTree
            items={tree || []}
            search={search}
            expanded={expanded}
            onToggle={toggleExpand}
            onFileClick={handleFileClick}
            currentPath={currentPath}
            agentId={agentId}
            onRefresh={refresh}
            onError={error}
          />
        </nav>
      </aside>

      {/* Right content panel */}
      <div className={styles.content}>
        <Outlet context={outletContext} />
      </div>
    </div>
  );
}
