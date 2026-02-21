import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useFileContent } from '../../hooks/useFiles';
import { useWebSocket } from '../../hooks/useWebSocket';
import styles from './MarkdownView.module.css';

function getFileIcon(path) {
  const name = path.split('/').pop();
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

export default function MarkdownView() {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { info, basePath = '' } = useOutletContext();
  const { content, loading, error, reload } = useFileContent(filePath);

  // Listen for file changes via WebSocket
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'file_changed' && msg.path === filePath) {
      info?.('📝 Archivo actualizado — recargando...');
      reload();
    }
  }, [filePath, reload, info]);

  useWebSocket(handleWsMessage);

  const handleEdit = () => {
    navigate(`${basePath}/edit/${encodeURIComponent(filePath)}`);
  };

  const handleBack = () => {
    navigate(basePath || '/');
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Cargando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>❌ {error}</p>
        <button onClick={handleBack}>Volver al dashboard</button>
      </div>
    );
  }

  const fileName = filePath.split('/').pop();

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={handleBack}>
          ← Volver
        </button>
        <div className={styles.breadcrumb}>
          <span className={styles.icon}>{getFileIcon(filePath)}</span>
          <span className={styles.path}>{filePath}</span>
        </div>
        <button className={styles.editBtn} onClick={handleEdit}>
          ✏️ Editar
        </button>
      </div>
      
      <article className={styles.content}>
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
