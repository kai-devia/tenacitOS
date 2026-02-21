import { useOutletContext } from 'react-router-dom';
import FileCard from './FileCard';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { files, basePath = '' } = useOutletContext();

  if (!files?.length) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📂</span>
        <p>No hay archivos markdown</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📚 Archivos de Contexto</h1>
      <div className={styles.grid}>
        {files.map(file => (
          <FileCard key={file.path} file={file} basePath={basePath} />
        ))}
      </div>
    </div>
  );
}
