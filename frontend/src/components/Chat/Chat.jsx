import { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../../api/client';
import { marked } from 'marked';
import styles from './Chat.module.css';

const API_BASE = '/api';

marked.setOptions({ breaks: true, gfm: true });

// ── Sub-components ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className={`${styles.msgRow} ${styles.msgRowAssistant}`}>
      <div className={styles.avatar}>K</div>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
        <div className={styles.typing}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function Message({ msg, isStreaming }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowAssistant}`}>
      {!isUser && <div className={styles.avatar}>K</div>}
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
        <div className={styles.bubbleText}>
          {isUser
            ? msg.content
            : <div
                className={styles.markdownContent}
                dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
              />
          }
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
}

// ── Main component ────────────────────────────────────────────────────────

export default function Chat() {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(true);
  const [streaming, setStreaming]       = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError]               = useState(null);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load history on mount
  useEffect(() => {
    const token = getToken();
    fetch(`${API_BASE}/chat/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
        // Instant scroll on first load (no animation)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom whenever messages or streaming state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streaming, streamingText, scrollToBottom]);

  // Send a message — triggers SSE stream
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setStreaming(true);
    setStreamingText('');
    setError(null);

    const token = getToken();

    try {
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();

          let event;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'user_message') {
            setMessages(prev => [...prev, event.message]);
          } else if (event.type === 'delta') {
            accumulated += event.content;
            setStreamingText(accumulated);
          } else if (event.type === 'done') {
            setMessages(prev => [...prev, event.message]);
            setStreamingText('');
            setStreaming(false);
          } else if (event.type === 'error') {
            throw new Error(event.error);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setStreaming(false);
      setStreamingText('');
    }
  }, [input, streaming]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const clearHistory = async () => {
    if (!window.confirm('¿Borrar todo el historial?')) return;
    const token = getToken();
    await fetch(`${API_BASE}/chat/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessages([]);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.centered}><div className={styles.spinner} /></div>;
  }

  return (
    <div className={styles.wrapper}>
      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && !streaming && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Kai está listo</p>
            <p className={styles.emptySub}>Escribe un mensaje para empezar</p>
          </div>
        )}

        {messages.length > 0 && (
          <div className={styles.clearRow}>
            <button className={styles.clearBtn} onClick={clearHistory}>
              Limpiar historial
            </button>
          </div>
        )}

        {messages.map(msg => <Message key={msg.id} msg={msg} />)}

        {streaming && !streamingText && <TypingIndicator />}
        {streaming && streamingText && (
          <Message
            msg={{ role: 'assistant', content: streamingText, created_at: null }}
            isStreaming
          />
        )}

        {error && (
          <div className={styles.errorBanner}>
            {error} — <button onClick={() => setError(null)}>Cerrar</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
          {/* No deshabilitar — disabled cierra el teclado en móvil */}
        />
        <button
          className={styles.sendBtn}
          onPointerDown={(e) => e.preventDefault()} /* evita que el botón robe el foco */
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          aria-label="Enviar"
        >
          {streaming
            ? <span className={styles.sendDots}><span/><span/><span/></span>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
          }
        </button>
      </div>
    </div>
  );
}
