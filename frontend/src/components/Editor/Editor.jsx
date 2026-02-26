import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useFileContent } from '../../hooks/useFiles';
import MarkdownEditor from './MarkdownEditor';
import styles from './Editor.module.css';

export default function Editor() {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { success, error: showError, basePath = '', agentId } = useOutletContext();
  const { content, loading, error, saving, save } = useFileContent(filePath, agentId);
  const [editedContent, setEditedContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (content !== undefined) {
      setEditedContent(content);
    }
  }, [content]);

  useEffect(() => {
    setHasChanges(editedContent !== content);
  }, [editedContent, content]);

  const handleSave = async () => {
    const ok = await save(editedContent);
    if (ok) {
      success?.('💾 Guardado correctamente');
      navigate(`${basePath}/file/${encodeURIComponent(filePath)}`);
    } else {
      showError?.('Error al guardar');
    }
  };

  const handleCancel = () => {
    if (hasChanges && !confirm('¿Descartar cambios?')) return;
    navigate(`${basePath}/file/${encodeURIComponent(filePath)}`);
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
        <button onClick={() => navigate(basePath || '/')}>Volver al dashboard</button>
      </div>
    );
  }

  const fileName = filePath.split('/').pop();

  return (
    <div className={styles.containerFull}>
      <MarkdownEditor
        value={editedContent}
        onChange={setEditedContent}
        placeholder="Escribe en Markdown..."
        fileName={fileName}
        hasChanges={hasChanges}
        saving={saving}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
