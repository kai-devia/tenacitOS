import { useState, useEffect, useRef, useCallback } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { getToken } from '../../api/client';
import { marked } from 'marked';
import {
  TypingIndicator,
  Message,
  ErrorBanner,
  EmptyState,
  SendButton,
  AudioButton,
} from './ChatComponents';
import { useStreamResponse } from './useStreamResponse';
import { useAudioRecorder } from './useAudioRecorder';
import styles from './Chat.module.css';
import { localImageCache } from './imageCache';

const API_BASE = '/api';
marked.setOptions({ breaks: true, gfm: true });

export default function Chat() {
  // ── State ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(0);
  // Image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // ── Refs ───────────────────────────────────────────────────────────────
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const queueRef = useRef([]);
  const busyRef = useRef(false);
  // Tracks texts sent optimistically from this device, so WS broadcast doesn't duplicate them
  const pendingTexts = useRef(new Set());

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { sendRequest: sendSSE, abort: abortSSE } = useStreamResponse(
    (accumulated) => setStreamText(accumulated),
    (message) => {
      setMessages((prev) => {
        // Dedup: WS might have already added this message
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setStreamText('');
      setStreaming(false);
    },
    (errorMsg) => {
      setError(errorMsg);
      setStreaming(false);
      setStreamText('');
    }
  );

  const {
    isRecording,
    recordingTime,
    audioBlob,
    startRecording,
    stopRecording,
    cancelRecording,
    clearAudioBlob,
  } = useAudioRecorder();

  // ── Effects ────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streaming, streamText, scrollToBottom]);

  // ── WebSocket: sync messages from other devices ───────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message' && data.message?.id) {
          const msg = data.message;

          if (msg.role === 'user' && pendingTexts.current.has(msg.content)) {
            // This is our own optimistic message coming back from the server
            // Replace the optimistic entry (local-* id) with the real one
            pendingTexts.current.delete(msg.content);
            setMessages((prev) =>
              prev.map((m) =>
                m.role === 'user' &&
                String(m.id).startsWith('local-') &&
                m.content === msg.content
                  ? msg
                  : m
              )
            );
          } else {
            setMessages((prev) => {
              // Only add if not already present (dedup by ID) — message from another device
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      } catch {}
    };

    ws.onerror = () => {}; // Silently ignore WS errors

    return () => ws.close();
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/chat/history`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
        setTimeout(
          () => bottomRef.current?.scrollIntoView({ behavior: 'instant' }),
          50
        );
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Queue Processing ───────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (busyRef.current || queueRef.current.length === 0) return;

    busyRef.current = true;
    const batch = [...queueRef.current];
    queueRef.current = [];
    setPending(0);

    const text = batch.join('\n\n');

    setStreaming(true);
    setStreamText('');
    setError(null);

    try {
      await sendSSE(text);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Re-enqueue batch + new messages for combined response
        queueRef.current = [...batch, ...queueRef.current];
        setPending(queueRef.current.length);
        // Process combined batch
        if (queueRef.current.length > 0) {
          setTimeout(() => processQueue(), 50);
        }
      }
    } finally {
      busyRef.current = false;
      // Process next batch if any
      if (queueRef.current.length > 0) {
        setTimeout(() => processQueue(), 50);
      }
    }
  }, [sendSSE]);

  // ── Message Sending ────────────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Optimistic update
    pendingTexts.current.add(text);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString().replace('T', ' ').split('.')[0],
      },
    ]);

    // Keep focus
    setTimeout(() => inputRef.current?.focus(), 0);

    queueRef.current.push(text);
    setPending(queueRef.current.length);

    if (busyRef.current) {
      // Abort current response and combine messages
      abortSSE();
    } else {
      processQueue();
    }
  }, [input, processQueue, abortSSE]);

  // ── Audio Sending ──────────────────────────────────────────────────────

  const sendAudio = useCallback(async () => {
    if (!audioBlob) return;

    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');

    // Optimistic update: mostrar como si enviara un mensaje
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        content: '🎤 [Audio enviado]',
        created_at: new Date().toISOString().replace('T', ' ').split('.')[0],
      },
    ]);

    clearAudioBlob();

    // Encolar el audio para procesar
    queueRef.current.push(`[AUDIO_MESSAGE]`);
    setPending(queueRef.current.length);

    // Guardar el blob temporalmente en una ref para el siguiente procesamiento
    const audioDataRef = { audioBlob };

    if (busyRef.current) {
      abortSSE();
    } else {
      // Enviar audio directamente
      busyRef.current = true;

      setStreaming(true);
      setStreamText('');
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/chat/send-audio`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let accumulated = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;

            let event;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (event.type === 'delta') {
              accumulated += event.content;
              setStreamText(accumulated);
            } else if (event.type === 'done') {
              setMessages((prev) => [...prev, event.message]);
              setStreamText('');
              setStreaming(false);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          }
        }
      } catch (err) {
        setError(err.message);
        setStreaming(false);
        setStreamText('');
      } finally {
        busyRef.current = false;
        queueRef.current = [];
        setPending(0);
      }
    }
  }, [audioBlob, clearAudioBlob, abortSSE]);

  // ── Image Handlers ─────────────────────────────────────────────────────

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    // Use FileReader → data URL (doesn't need to be revoked)
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreviewUrl(ev.target.result);
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const clearImage = useCallback(() => {
    setImageFile(null);
    setImagePreviewUrl(null);
  }, []);

  const sendImageMessage = useCallback(async () => {
    if (!imageFile || streaming) return;

    const caption = input.trim();
    const dbContent = caption ? `[Imagen] ${caption}` : '[Imagen]';

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Optimistic message (show image + caption locally)
    const localId = `local-${Date.now()}`;
    const localPreview = imagePreviewUrl;
    localImageCache.set(localId, localPreview);
    pendingTexts.current.add(dbContent);

    setMessages(prev => [...prev, {
      id: localId,
      role: 'user',
      content: dbContent,
      created_at: new Date().toISOString().replace('T', ' ').split('.')[0],
    }]);

    const savedFile = imageFile;
    clearImage();

    setStreaming(true);
    setStreamText('');
    setError(null);

    const formData = new FormData();
    formData.append('image', savedFile, savedFile.name);
    if (caption) formData.append('message', caption);

    try {
      const res = await fetch(`${API_BASE}/chat/send-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let event;
          try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (event.type === 'user_message') {
            // Replace optimistic with real DB message, carry over image cache
            localImageCache.set(event.message.id, localPreview);
            localImageCache.delete(localId);
            pendingTexts.current.delete(dbContent);
            setMessages(prev => prev.map(m =>
              m.id === localId ? event.message : m
            ));
          } else if (event.type === 'delta') {
            accumulated += event.content;
            setStreamText(accumulated);
          } else if (event.type === 'done') {
            setMessages(prev => {
              if (prev.some(m => m.id === event.message.id)) return prev;
              return [...prev, event.message];
            });
            setStreamText('');
            setStreaming(false);
          } else if (event.type === 'error') {
            throw new Error(event.error);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setStreamText('');
      setStreaming(false);
    }
  }, [imageFile, imagePreviewUrl, input, streaming, clearImage]);

  // ── Input Handlers ─────────────────────────────────────────────────────

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

  // ── Actions ────────────────────────────────────────────────────────────

  const clearHistory = async () => {
    if (!window.confirm('¿Borrar todo el historial?')) return;
    await fetch(`${API_BASE}/chat/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setMessages([]);
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const hasText = input.trim().length > 0;
  const hasImage = !!imageFile;

  return (
    <div className={styles.wrapper}>
      <div className={styles.messages}>
        {messages.length === 0 && !streaming && <EmptyState />}

        {messages.length > 0 && (
          <div className={styles.clearRow}>
            <button className={styles.clearBtn} onClick={clearHistory}>
              Limpiar historial
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}

        {streaming && !streamText && <TypingIndicator />}
        {streaming && streamText && (
          <Message
            msg={{
              role: 'assistant',
              content: streamText,
              created_at: null,
            }}
            isStreaming
          />
        )}

        {error && (
          <ErrorBanner error={error} onClose={() => setError(null)} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Hidden file input for images */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageSelect}
      />

      <div className={styles.inputArea}>
        {/* Image preview strip */}
        {imagePreviewUrl && (
          <div className={styles.imagePreviewRow}>
            <div className={styles.imagePreviewWrap}>
              <img src={imagePreviewUrl} alt="preview" className={styles.imagePreview} />
              <button className={styles.imageRemoveBtn} onClick={clearImage} title="Quitar imagen">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                hasImage ? sendImageMessage() : sendMessage();
              } else {
                handleKeyDown(e);
              }
            }}
            placeholder={hasImage ? 'Añade un texto (opcional)...' : 'Escribe un mensaje...'}
            rows={1}
          />

          {/* Image button — always visible unless recording audio */}
          {!isRecording && !audioBlob && (
            <button
              className={styles.imageBtn}
              onClick={() => imageInputRef.current?.click()}
              title="Adjuntar imagen"
              disabled={streaming}
            >
              <ImagePlus size={18} strokeWidth={1.5} />
            </button>
          )}

          {/* Send / Audio buttons */}
          {hasImage || hasText ? (
            <SendButton
              pending={pending}
              disabled={streaming}
              onClick={hasImage ? sendImageMessage : sendMessage}
            />
          ) : (
            <AudioButton
              isRecording={isRecording}
              recordingTime={recordingTime}
              hasAudio={!!audioBlob}
              onStartRecord={startRecording}
              onStopRecord={stopRecording}
              onCancelRecord={cancelRecording}
              onSendAudio={sendAudio}
            />
          )}
        </div>
      </div>
    </div>
  );
}
