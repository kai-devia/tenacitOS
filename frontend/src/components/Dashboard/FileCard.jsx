import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFileContent } from '../../api/client';
import styles from './FileCard.module.css';

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

function getPreview(content) {
  if (!content) return '';
  
  // Split into lines, filter out headers and empty lines
  const lines = content.split('\n');
  let preview = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers, empty lines, and code blocks
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---')) {
      continue;
    }
    preview += trimmed + ' ';
    if (preview.length > 200) break;
  }
  
  preview = preview.trim();
  if (preview.length > 200) {
    preview = preview.slice(0, 200) + '...';
  }
  
  return preview || 'Sin contenido';
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7) return `Hace ${days} días`;
  
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function FileCard({ file, basePath = '' }) {
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    
    getFileContent(file.path)
      .then(data => {
        if (mounted) {
          setPreview(getPreview(data.content));
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setPreview('Error al cargar');
          setLoading(false);
        }
      });
    
    return () => { mounted = false; };
  }, [file.path]);

  const handleClick = () => {
    navigate(`${basePath}/file/${encodeURIComponent(file.path)}`);
  };

  return (
    <article className={styles.card} onClick={handleClick}>
      <div className={styles.header}>
        <span className={styles.icon}>{getFileIcon(file.name)}</span>
        <h3 className={styles.name}>{file.name}</h3>
      </div>
      <p className={styles.preview}>
        {loading ? '...' : preview}
      </p>
      <div className={styles.footer}>
        <span className={styles.path}>{file.path}</span>
        <span className={styles.time}>{formatRelativeTime(file.mtime)}</span>
      </div>
    </article>
  );
}
