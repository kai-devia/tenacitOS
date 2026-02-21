import { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../../api/client';
import styles from './Chat.module.css';

const API_BASE = '/api';

function Message({ msg, isStreaming }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowAssistant}`}>
      {!isUser && <div className={styles.avatar}>K</div>}
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
        <div className={styles.bubbleText}>
          {msg.content}
          {isStreaming && <span className={styles.cursor} />}
        </div>
        {msg.created_at && (
          <div className={styles.bubbleTime}>
            {new Date(msg.created_at + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(true);
  const [streaming, setStreaming]     = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError]             = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const abortRef  = useRef(null);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Load history
  useEffect(() => {
    const token = getToken();
    fetch(`${API_BASE}/chat/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [scrollToBottom]);

  useEffect(() => {
    if (!streaming) scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  useEffect(() => {
    if (streaming) scrollToBottom();
  }, [streamingText, streaming, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingText('');
    setError(null);

    const token = getToken();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('Error al enviar mensaje');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          try {
            const event = JSON.parse(raw);

            if (event.type === 'user_message') {
              setMessages(prev => [...prev, event.message]);
            } else if (event.type === 'delta') {
              accumulated += event.content;
              setStreamingText(accumulated);
            } else if (event.type === 'done') {
              setMessages(prev => [...prev, event.message]);
              setStreamingText('');
              setStreaming(false);
              inputRef.current?.focus();
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
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
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const clearHistory = async () => {
    if (!window.confirm('¿Borrar todo el historial del chat?')) return;
    const token = getToken();
    await fetch(`${API_BASE}/chat/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessages([]);
  };

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>Kai</span>
        <div className={styles.headerActions}>
          {messages.length > 0 && (
            <button className={styles.clearBtn} onClick={clearHistory}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && !streaming && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Kai está listo</p>
            <p className={styles.emptySub}>Escribe un mensaje para empezar</p>
          </div>
        )}

        {messages.map(msg => (
          <Message key={msg.id} msg={msg} />
        ))}

        {/* Streaming message */}
        {streaming && streamingText && (
          <Message
            msg={{ role: 'assistant', content: streamingText, created_at: null }}
            isStreaming
          />
        )}

        {/* Typing indicator (before first token arrives) */}
        {streaming && !streamingText && (
          <div className={`${styles.msgRow} ${styles.msgRowAssistant}`}>
            <div className={styles.avatar}>K</div>
            <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
              <div className={styles.typing}>
                <span /><span /><span />
              </div>
            </div>
          </div>
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
          disabled={streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
        >
          {streaming ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
