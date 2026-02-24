import { useState, useRef, useEffect } from 'react';
import styles from './FileTree.module.css';

function getFileIcon(name) {
  if (name === 'MEMORY.md') return '🧠';
  if (name === 'SOUL.md') return '✨';
  if (name === 'IDENTITY.md') return '🪪';
  if (name === 'USER.md') return '👤';
  if (name === 'TOOLS.md') return '🛠️';
  if (name === 'HEARTBEAT.md') return '💓';
  if (name === 'AGENTS.md') return '🤖';
  if (name === '_index.md') return '📑';
  if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) return '📅';
  return '📄';
}

function matchesSearch(name, search) {
  if (!search) return true;
  return name.toLowerCase().includes(search.toLowerCase());
}

function hasMatchingChild(item, search) {
  if (!search) return true;
  if (item.type === 'file') return matchesSearch(item.name, search);
  return item.children?.some(child => hasMatchingChild(child, search));
}

// Inline input for new item name
function InlineInput({ placeholder, onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onConfirm(value.trim()); }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={styles.inlineInputWrap}>
      <input
        ref={inputRef}
        className={styles.inlineInput}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => onCancel()}
        placeholder={placeholder}
      />
    </div>
  );
}

// Single tree node
function TreeNode({ item, search, expanded, onToggle, onFileClick, currentPath, depth, agentId, onRefresh, onError }) {
  const [hovered, setHovered] = useState(false);
  const [creating, setCreating] = useState(null); // 'file' | 'dir' | null
  const [renaming, setRenaming] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const isDir = item.type === 'dir';

  const apiBase = '/api/files';
  const agentParam = `agentId=${agentId || 'kai'}`;

  async function handleCreate(name) {
    if (!name) { setCreating(null); return; }

    const parentPath = item.path;
    const newPath = `${parentPath}/${name}${creating === 'file' && !name.endsWith('.md') ? '.md' : ''}`;

    try {
      const endpoint = creating === 'file' ? `${apiBase}/create` : `${apiBase}/mkdir`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('kai_token')}` },
        body: JSON.stringify({ path: newPath, agentId: agentId || 'kai' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear');
      onRefresh();
      // Auto-expand the folder
      onToggle(item.path);
    } catch (err) {
      onError(err.message);
    }

    setCreating(null);
    setShowCreateMenu(false);
  }

  async function handleRename(newName) {
    if (!newName || newName === item.name) { setRenaming(false); return; }

    const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    const newPath = parent ? `${parent}/${newName}` : newName;

    try {
      const res = await fetch(`${apiBase}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('kai_token')}` },
        body: JSON.stringify({ oldPath: item.path, newPath, agentId: agentId || 'kai' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al renombrar');
      onRefresh();
    } catch (err) {
      onError(err.message);
    }

    setRenaming(false);
  }

  async function handleDelete(e) {
    e.stopPropagation();
    const label = isDir ? 'carpeta y todo su contenido' : 'archivo';
    if (!confirm(`¿Eliminar ${label} "${item.name}"?`)) return;

    try {
      const res = await fetch(`${apiBase}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('kai_token')}` },
        body: JSON.stringify({ path: item.path, agentId: agentId || 'kai' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      onRefresh();
    } catch (err) {
      onError(err.message);
    }
  }

  if (!hasMatchingChild(item, search)) return null;

  return (
    <li className={styles.item}>
      {/* Row */}
      <div
        className={styles.row}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowCreateMenu(false); }}
        style={{ paddingLeft: depth * 12 }}
      >
        {renaming ? (
          <InlineInput
            placeholder={item.name}
            onConfirm={handleRename}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            {/* Main button */}
            <button
              className={`${isDir ? styles.folder : styles.file} ${!isDir && currentPath === item.path ? styles.active : ''}`}
              onClick={() => isDir ? onToggle(item.path) : onFileClick(item.path)}
            >
              {isDir && (
                <span className={`${styles.arrow} ${expanded[item.path] ? styles.expanded : ''}`}>▶</span>
              )}
              <span className={isDir ? styles.folderIcon : styles.fileIcon}>
                {isDir ? '📁' : getFileIcon(item.name)}
              </span>
              <span className={styles.name}>{item.name}</span>
            </button>

            {/* Actions — visible on hover */}
            {hovered && (
              <div className={styles.actions}>
                {isDir && (
                  <div className={styles.createWrap}>
                    <button
                      className={styles.actionBtn}
                      title="Nuevo"
                      onMouseDown={e => { e.preventDefault(); setShowCreateMenu(v => !v); }}
                    >+</button>
                    {showCreateMenu && (
                      <div className={styles.createMenu}>
                        <button onMouseDown={e => { e.preventDefault(); setCreating('file'); setShowCreateMenu(false); }}>
                          📄 Archivo
                        </button>
                        <button onMouseDown={e => { e.preventDefault(); setCreating('dir'); setShowCreateMenu(false); }}>
                          📁 Carpeta
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  className={styles.actionBtn}
                  title="Renombrar"
                  onMouseDown={e => { e.preventDefault(); setRenaming(true); }}
                >✏</button>
                <button
                  className={`${styles.actionBtn} ${styles.actionDanger}`}
                  title="Eliminar"
                  onMouseDown={handleDelete}
                >✕</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* New item input */}
      {creating && (
        <div style={{ paddingLeft: (depth + 1) * 12 + 16 }}>
          <InlineInput
            placeholder={creating === 'file' ? 'nombre.md' : 'nueva-carpeta'}
            onConfirm={handleCreate}
            onCancel={() => setCreating(null)}
          />
        </div>
      )}

      {/* Children */}
      {isDir && expanded[item.path] && (
        <FileTree
          items={item.children}
          search={search}
          expanded={expanded}
          onToggle={onToggle}
          onFileClick={onFileClick}
          currentPath={currentPath}
          depth={depth + 1}
          agentId={agentId}
          onRefresh={onRefresh}
          onError={onError}
        />
      )}
    </li>
  );
}

export default function FileTree({ items, search, expanded, onToggle, onFileClick, currentPath, depth = 0, agentId, onRefresh, onError }) {
  if (!items?.length) return null;

  return (
    <ul className={styles.list}>
      {items.map(item => (
        <TreeNode
          key={item.path}
          item={item}
          search={search}
          expanded={expanded}
          onToggle={onToggle}
          onFileClick={onFileClick}
          currentPath={currentPath}
          depth={depth}
          agentId={agentId}
          onRefresh={onRefresh || (() => {})}
          onError={onError || (() => {})}
        />
      ))}
    </ul>
  );
}
