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
        <div className={styles.typing}><span /><span /><span /></div>
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
            : <div className={styles.markdownContent}
                dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }} />
          }
          {isStreaming && <span className={styles.cursor} />}
        </div>
        {msg.created_at && (
          <div className={styles.bubbleTime}>
            {new Date(msg.created_at + 'Z').toLocaleTimeString('es-ES', {
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function Chat() {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamText,setStreamText]= useState('');
  const [error,     setError]     = useState(null);
  const [pending,   setPending]   = useState(0);

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const queueRef     = useRef([]);
  const busyRef      = useRef(false);

  // ── Scroll ───────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streaming, streamText, scrollToBottom]);

  // ── Load history ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/chat/history`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []); // eslint-disable-line

  // ── processNext: saca un msg de la cola y lo procesa ─────────────────────
  //
  // Diseño:
  //  - El mensaje del usuario YA está en el chat (añadido optimisticamente en sendMessage)
  //  - Solo necesitamos enviar al backend y mostrar la respuesta
  //  - Cuando llega 'user_message' del SSE lo ignoramos (ya está en el chat)
  //  - Cuando llega 'done' añadimos la respuesta del asistente
  //
  const processNext = useCallback(async () => {
    if (busyRef.current || queueRef.current.length === 0) return;

    busyRef.current = true;
    const text = queueRef.current.shift();
    setPending(queueRef.current.length);

    setStreaming(true);
    setStreamText('');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }

          // 'user_message' se ignora — ya está en el chat por el optimistic update
          if (ev.type === 'delta') {
            accumulated += ev.content;
            setStreamText(accumulated);
          } else if (ev.type === 'done') {
            setMessages(prev => [...prev, ev.message]);
            setStreamText('');
            setStreaming(false);
          } else if (ev.type === 'error') {
            throw new Error(ev.error);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setStreaming(false);
      setStreamText('');
    } finally {
      busyRef.current = false;
      if (queueRef.current.length > 0) {
        processNext();
      }
    }
  }, []); // eslint-disable-line

  // ── sendMessage: muestra el msg al instante y lo encola ──────────────────
  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Optimistic update: el mensaje aparece en el chat INMEDIATAMENTE
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString().replace('T', ' ').split('.')[0],
    }]);

    queueRef.current.push(text);
    setPending(queueRef.current.length);

    if (!busyRef.current) {
      processNext();
    }
  }, [input, processNext]);

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // ── Clear history ─────────────────────────────────────────────────────────
  const clearHistory = async () => {
    if (!window.confirm('¿Borrar todo el historial?')) return;
    await fetch(`${API_BASE}/chat/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setMessages([]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className={styles.centered}><div className={styles.spinner} /></div>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.messages}>

        {messages.length === 0 && !streaming && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Kai está listo</p>
            <p className={styles.emptySub}>Escribe un mensaje para empezar</p>
          </div>
        )}

        {messages.length > 0 && (
          <div className={styles.clearRow}>
            <button className={styles.clearBtn} onClick={clearHistory}>Limpiar historial</button>
          </div>
        )}

        {messages.map(msg => <Message key={msg.id} msg={msg} />)}

        {streaming && !streamText && <TypingIndicator />}
        {streaming && streamText && (
          <Message msg={{ role: 'assistant', content: streamText, created_at: null }} isStreaming />
        )}

        {error && (
          <div className={styles.errorBanner}>
            {error} — <button onClick={() => setError(null)}>Cerrar</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onPointerDown={(e) => e.preventDefault()}
          onClick={sendMessage}
          disabled={!input.trim()}
          aria-label="Enviar"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
          {pending > 0 && <span className={styles.pendingBadge}>{pending}</span>}
        </button>
      </div>
    </div>
  );
}
