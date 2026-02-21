import { memo } from 'react';
import { marked } from 'marked';
import styles from './Chat.module.css';

export const TypingIndicator = memo(() => (
  <div className={`${styles.msgRow} ${styles.msgRowAssistant}`}>
    <div className={styles.avatar}>K</div>
    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
      <div className={styles.typing}>
        <span /><span /><span />
      </div>
    </div>
  </div>
));

TypingIndicator.displayName = 'TypingIndicator';

export const Message = memo(({ msg, isStreaming }) => {
  const isUser = msg.role === 'user';
  
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowAssistant}`}>
      {!isUser && <div className={styles.avatar}>K</div>}
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
        <div className={styles.bubbleText}>
          {isUser ? (
            msg.content
          ) : (
            <div
              className={styles.markdownContent}
              dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
            />
          )}
          {isStreaming && <span className={styles.cursor} />}
        </div>
        {msg.created_at && (
          <div className={styles.bubbleTime}>
            {new Date(msg.created_at + 'Z').toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
});

Message.displayName = 'Message';

export const ErrorBanner = memo(({ error, onClose }) => (
  <div className={styles.errorBanner}>
    {error} —{' '}
    <button onClick={onClose}>Cerrar</button>
  </div>
));

ErrorBanner.displayName = 'ErrorBanner';

export const EmptyState = memo(() => (
  <div className={styles.empty}>
    <p className={styles.emptyTitle}>Kai está listo</p>
    <p className={styles.emptySub}>Escribe un mensaje para empezar</p>
  </div>
));

EmptyState.displayName = 'EmptyState';

export const SendButton = memo(({ pending, disabled, onClick }) => (
  <button
    className={styles.sendBtn}
    onPointerDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    aria-label="Enviar"
    style={{ position: 'relative' }}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
    {pending > 0 && (
      <span
        style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#000',
          fontSize: '0.7rem',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid var(--bg-surface)',
        }}
      >
        {pending}
      </span>
    )}
  </button>
));

SendButton.displayName = 'SendButton';

export const AudioButton = memo(
  ({
    isRecording,
    recordingTime,
    hasAudio,
    onStartRecord,
    onStopRecord,
    onCancelRecord,
    onSendAudio,
  }) => {
    if (isRecording) {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              minWidth: '40px',
              textAlign: 'center',
            }}
          >
            {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
          </span>
          <button
            className={`${styles.sendBtn} ${styles.recording}`}
            onClick={onStopRecord}
            title="Detener grabación"
            aria-label="Detener"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
          <button
            className={styles.sendBtn}
            onClick={onCancelRecord}
            title="Cancelar grabación"
            aria-label="Cancelar"
            style={{ background: '#666' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      );
    }

    if (hasAudio) {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={styles.sendBtn}
            onClick={onSendAudio}
            title="Enviar audio"
            aria-label="Enviar"
            style={{ background: 'var(--accent)' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
          <button
            className={styles.sendBtn}
            onClick={onCancelRecord}
            title="Descartar audio"
            aria-label="Descartar"
            style={{ background: '#666' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      );
    }

    return (
      <button
        className={styles.sendBtn}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onStartRecord}
        aria-label="Grabar audio"
        title="Pulsa para grabar audio"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-2 16.93A8 8 0 0 0 20 10h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 10 8.93V21H10v2h4v-2h-4v-2.07z"/>
        </svg>
      </button>
    );
  }
);

AudioButton.displayName = 'AudioButton';
