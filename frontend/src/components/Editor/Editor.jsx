import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useFileContent } from '../../hooks/useFiles';
import styles from './Editor.module.css';

export default function Editor() {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { success, error: showError, basePath = '' } = useOutletContext();
  const { content, loading, error, saving, save } = useFileContent(filePath);
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
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.info}>
          <span className={styles.icon}>✏️</span>
          <span className={styles.path}>Editando: {fileName}</span>
          {hasChanges && <span className={styles.unsaved}>• Sin guardar</span>}
        </div>
        <div className={styles.actions}>
          <button 
            className={styles.cancelBtn} 
            onClick={handleCancel}
            disabled={saving}
          >
            ✕ Cancelar
          </button>
          <button 
            className={styles.saveBtn} 
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </div>
      </div>
      
      <textarea
        className={styles.editor}
        value={editedContent}
        onChange={(e) => setEditedContent(e.target.value)}
        placeholder="Escribe aquí..."
        spellCheck="false"
      />
    </div>
  );
}
