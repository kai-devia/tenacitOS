import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './FileTree.module.css';

// ── Icons ────────────────────────────────────────────────────────────────────
function getFileIcon(name) {
  if (name === 'MEMORY.md')    return '🧠';
  if (name === 'SOUL.md')      return '✨';
  if (name === 'IDENTITY.md')  return '🪪';
  if (name === 'USER.md')      return '👤';
  if (name === 'TOOLS.md')     return '🛠️';
  if (name === 'HEARTBEAT.md') return '💓';
  if (name === 'AGENTS.md')    return '🤖';
  if (name === '_index.md')    return '📑';
  if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) return '📅';
  return '📄';
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiCall(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('kai-doc-token')}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, item, onClose, onAction }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Adjust position so menu doesn't go off screen
  const style = { top: y, left: x };

  return (
    <div ref={ref} className={styles.contextMenu} style={style}>
      <button onClick={() => onAction('newFile')}>
        <i className="fa fa-file-o" /> Nuevo archivo aquí
      </button>
      <button onClick={() => onAction('newDir')}>
        <i className="fa fa-folder-o" /> Nueva carpeta aquí
      </button>
      <div className={styles.menuSep} />
      <button onClick={() => onAction('rename')}>
        <i className="fa fa-pencil" /> Renombrar
      </button>
      <button onClick={() => onAction('move')}>
        <i className="fa fa-arrows" /> Mover a...
      </button>
      <div className={styles.menuSep} />
      <button className={styles.menuDanger} onClick={() => onAction('delete')}>
        <i className="fa fa-trash-o" /> Eliminar
      </button>
    </div>
  );
}

// ── Move Modal ────────────────────────────────────────────────────────────────
function MoveModal({ item, tree, onClose, onMove }) {
  const [selected, setSelected] = useState('');

  function FolderOption({ node, depth = 0 }) {
    if (node.type !== 'dir') return null;
    if (node.path === item.path) return null;
    return <>
      <button
        className={`${styles.moveOption} ${selected === node.path ? styles.moveSelected : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => setSelected(node.path)}
      >
        📁 {node.name}
      </button>
      {(node.children || []).map(c => (
        <FolderOption key={c.path} node={c} depth={depth + 1} />
      ))}
    </>;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Mover <strong>{item.name}</strong> a...</span>
          <button onClick={onClose}><i className="fa fa-times" /></button>
        </div>
        <div className={styles.modalBody}>
          <button
            className={`${styles.moveOption} ${selected === '' ? styles.moveSelected : ''}`}
            onClick={() => setSelected('')}
          >
            📁 / (raíz)
          </button>
          {(tree || []).map(node => (
            <FolderOption key={node.path} node={node} />
          ))}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.modalCancel} onClick={onClose}>Cancelar</button>
          <button className={styles.modalConfirm} onClick={() => onMove(selected)}>
            Mover aquí
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline input ──────────────────────────────────────────────────────────────
function InlineInput({ defaultValue = '', placeholder, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); onConfirm(value.trim()); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <input
      ref={ref}
      className={styles.inlineInput}
      value={value}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKey}
      onBlur={() => onConfirm(value.trim())}
      onClick={e => e.stopPropagation()}
    />
  );
}

// ── Tree Node ─────────────────────────────────────────────────────────────────
function TreeNode({
  item, depth, expanded, onToggle, onFileClick, currentPath,
  agentId, onRefresh, onError, fullTree,
  contextMenu, setContextMenu, renaming, setRenaming, moveTarget, setMoveTarget,
  creating, setCreating,
  dragState, setDragState, onReorder,
}) {
  const isDir  = item.type === 'dir';
  const isOpen = expanded[item.path];

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const isDragOver = dragState?.overPath === item.path;
  const isDragging = dragState?.dragPath === item.path;

  const handleDragStart = (e) => {
    e.stopPropagation();
    setDragState({ dragPath: item.path, dragItem: item });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState?.dragPath === item.path) return;
    // Only allow reorder within same parent level
    const dragParent = dragState?.dragPath?.includes('/')
      ? dragState.dragPath.slice(0, dragState.dragPath.lastIndexOf('/'))
      : '';
    const thisParent = item.path.includes('/')
      ? item.path.slice(0, item.path.lastIndexOf('/'))
      : '';
    if (dragParent !== thisParent) return;
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({ ...prev, overPath: item.path }));
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragState(prev => ({ ...prev, overPath: null }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState?.dragItem || dragState.dragPath === item.path) {
      setDragState(null);
      return;
    }
    onReorder(dragState.dragItem, item);
    setDragState(null);
  };

  const handleDragEnd = () => setDragState(null);

  // Right-click → context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // Context menu action dispatch
  const handleAction = useCallback(async (action) => {
    setContextMenu(null);
    if (action === 'newFile')  { if (!isOpen) onToggle(item.path); setCreating({ parent: item.path, type: 'file' }); }
    if (action === 'newDir')   { if (!isOpen) onToggle(item.path); setCreating({ parent: item.path, type: 'dir' }); }
    if (action === 'rename')   setRenaming(item.path);
    if (action === 'move')     setMoveTarget(item);
    if (action === 'delete') {
      const label = isDir ? 'carpeta y todo su contenido' : 'archivo';
      if (!confirm(`¿Eliminar ${label} "${item.name}"?`)) return;
      try {
        await apiCall('/api/files', 'DELETE', { path: item.path, agentId });
        onRefresh();
      } catch (err) { onError(err.message); }
    }
  }, [item, isDir, isOpen]);

  // Rename confirm
  const handleRename = async (newName) => {
    setRenaming(null);
    if (!newName || newName === item.name) return;
    const ext     = !isDir && !newName.includes('.') ? '.md' : '';
    const parent  = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    const newPath = parent ? `${parent}/${newName}${ext}` : `${newName}${ext}`;
    try {
      await apiCall('/api/files/rename', 'POST', { oldPath: item.path, newPath, agentId });
      onRefresh();
    } catch (err) { onError(err.message); }
  };

  return (
    <li>
      {/* Row */}
      <div
        className={[
          styles.row,
          !isDir && currentPath === item.path ? styles.active : '',
          isDragging  ? styles.dragging  : '',
          isDragOver  ? styles.dragOver  : '',
        ].join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={() => renaming === item.path ? null : (isDir ? onToggle(item.path) : onFileClick(item.path))}
        onContextMenu={handleContextMenu}
      >
        {isDir && (
          <span className={`${styles.arrow} ${isOpen ? styles.expanded : ''}`}>▶</span>
        )}
        <span className={styles.nodeIcon}>
          {isDir ? (isOpen ? '📂' : '📁') : getFileIcon(item.name)}
        </span>

        {renaming === item.path
          ? <InlineInput
              defaultValue={item.name}
              onConfirm={handleRename}
              onCancel={() => setRenaming(null)}
            />
          : <span className={styles.name}>{item.name}</span>
        }
      </div>

      {/* New item inline input (inside this folder) */}
      {creating?.parent === item.path && isOpen && (
        <div style={{ paddingLeft: 8 + (depth + 1) * 14 + 20 }}>
          <InlineInput
            placeholder={creating.type === 'file' ? 'nombre.md' : 'nueva-carpeta'}
            onConfirm={async (name) => {
              setCreating(null);
              if (!name) return;
              const ext      = creating.type === 'file' && !name.includes('.') ? '.md' : '';
              const newPath  = `${item.path}/${name}${ext}`;
              const endpoint = creating.type === 'file' ? '/api/files/create' : '/api/files/mkdir';
              try {
                await apiCall(endpoint, 'POST', { path: newPath, agentId });
                onRefresh();
              } catch (err) { onError(err.message); }
            }}
            onCancel={() => setCreating(null)}
          />
        </div>
      )}

      {/* Children */}
      {isDir && isOpen && item.children?.length > 0 && (
        <ul className={styles.list}>
          {item.children.map(child => (
            <TreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onFileClick={onFileClick}
              currentPath={currentPath}
              agentId={agentId}
              onRefresh={onRefresh}
              onError={onError}
              fullTree={fullTree}
              contextMenu={contextMenu}
              setContextMenu={setContextMenu}
              renaming={renaming}
              setRenaming={setRenaming}
              moveTarget={moveTarget}
              setMoveTarget={setMoveTarget}
              creating={creating}
              setCreating={setCreating}
              dragState={dragState}
              setDragState={setDragState}
              onReorder={onReorder}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Main FileTree ─────────────────────────────────────────────────────────────
export default function FileTree({
  items, search, expanded, onToggle, onFileClick, currentPath,
  agentId, onRefresh, onError,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [renaming, setRenaming]       = useState(null);
  const [moveTarget, setMoveTarget]   = useState(null);
  const [creating, setCreating]       = useState(null);
  const [dragState, setDragState]     = useState(null); // { dragPath, dragItem, overPath }

  // Close context menu on outside click handled inside ContextMenu component

  // Filter by search
  function hasMatch(item) {
    if (!search) return true;
    if (item.name.toLowerCase().includes(search.toLowerCase())) return true;
    return item.children?.some(hasMatch);
  }

  // Drag & drop reorder — saves new order to backend
  const handleReorder = async (dragItem, dropItem) => {
    // Get the parent dir key (empty string = root)
    const parentPath = dragItem.path.includes('/')
      ? dragItem.path.slice(0, dragItem.path.lastIndexOf('/'))
      : '';

    // Get siblings at this level
    let siblings;
    if (!parentPath) {
      siblings = items || [];
    } else {
      // Find the parent node in the tree
      function findChildren(nodes, targetPath) {
        for (const n of nodes) {
          if (n.path === targetPath) return n.children || [];
          if (n.children) {
            const found = findChildren(n.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      }
      siblings = findChildren(items || [], parentPath) || [];
    }

    // Build new order: move dragItem before dropItem
    const names   = siblings.map(s => s.name);
    const dragIdx = names.indexOf(dragItem.name);
    const dropIdx = names.indexOf(dropItem.name);
    if (dragIdx === -1 || dropIdx === -1) return;

    names.splice(dragIdx, 1);
    const newDropIdx = names.indexOf(dropItem.name);
    names.splice(newDropIdx, 0, dragItem.name);

    try {
      await apiCall('/api/files/order', 'PUT', {
        agentId,
        dirKey: parentPath,
        items: names,
      });
      onRefresh?.();
    } catch (err) { onError?.(err.message); }
  };

  const handleMove = async (destPath) => {
    setMoveTarget(null);
    const name    = moveTarget.path.split('/').pop();
    const newPath = destPath ? `${destPath}/${name}` : name;
    if (newPath === moveTarget.path) return;
    try {
      await apiCall('/api/files/rename', 'POST', {
        oldPath: moveTarget.path, newPath, agentId,
      });
      onRefresh();
    } catch (err) { onError?.(err.message); }
  };

  const filtered = (items || []).filter(hasMatch);

  return (
    <>
      <ul className={styles.list}>
        {/* Inline input for new item at root level */}
        {creating?.parent === '' && (
          <li>
            <div style={{ paddingLeft: 8 }}>
              <InlineInput
                placeholder={creating.type === 'file' ? 'nombre.md' : 'nueva-carpeta'}
                onConfirm={async (name) => {
                  setCreating(null);
                  if (!name) return;
                  const ext      = creating.type === 'file' && !name.includes('.') ? '.md' : '';
                  const endpoint = creating.type === 'file' ? '/api/files/create' : '/api/files/mkdir';
                  try {
                    await apiCall(endpoint, 'POST', { path: `${name}${ext}`, agentId });
                    onRefresh?.();
                  } catch (err) { onError?.(err.message); }
                }}
                onCancel={() => setCreating(null)}
              />
            </div>
          </li>
        )}
        {filtered.map(item => (
          <TreeNode
            key={item.path}
            item={item}
            depth={0}
            expanded={expanded}
            onToggle={onToggle}
            onFileClick={onFileClick}
            currentPath={currentPath}
            agentId={agentId}
            onRefresh={onRefresh || (() => {})}
            onError={onError || (() => {})}
            fullTree={items}
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
            renaming={renaming}
            setRenaming={setRenaming}
            moveTarget={moveTarget}
            setMoveTarget={setMoveTarget}
            creating={creating}
            setCreating={setCreating}
            dragState={dragState}
            setDragState={setDragState}
            onReorder={handleReorder}
          />
        ))}
      </ul>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onAction={(action) => {
            const item = contextMenu.item;
            setContextMenu(null);
            // Dispatch to the node via state
            if (action === 'rename')  setRenaming(item.path);
            if (action === 'move')    setMoveTarget(item);
            if (action === 'newFile' || action === 'newDir') {
              // For files, create in parent dir; for dirs, create inside
              const isDir   = item.type === 'dir';
              const parent  = isDir
                ? item.path
                : (item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '');
              if (parent && !expanded[parent]) onToggle(parent);
              setCreating({ parent, type: action === 'newFile' ? 'file' : 'dir' });
            }
            if (action === 'delete') {
              const isDir = item.type === 'dir';
              const label = isDir ? 'carpeta y todo su contenido' : 'archivo';
              if (!confirm(`¿Eliminar ${label} "${item.name}"?`)) return;
              apiCall('/api/files', 'DELETE', { path: item.path, agentId })
                .then(() => onRefresh?.())
                .catch(err => onError?.(err.message));
            }
          }}
        />
      )}

      {/* Move modal */}
      {moveTarget && (
        <MoveModal
          item={moveTarget}
          tree={items}
          onClose={() => setMoveTarget(null)}
          onMove={handleMove}
        />
      )}
    </>
  );
}
