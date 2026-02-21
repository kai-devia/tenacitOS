import { useCallback } from 'react';
import { getToken } from '../../api/client';

const API_BASE = '/api';

/**
 * Hook para procesar respuestas SSE del backend
 * @param {Function} onDelta - callback cuando llega contenido parcial
 * @param {Function} onDone - callback cuando termina la respuesta
 * @param {Function} onError - callback para errores
 * @returns {Object} { sendRequest, abort }
 */
export function useStreamResponse(onDelta, onDone, onError) {
  const abortControllerRef = { current: null };

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendRequest = useCallback(
    async (message) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`${API_BASE}/chat/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
              onDelta?.(accumulated);
            } else if (event.type === 'done') {
              onDone?.(event.message);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          onError?.(err.message);
        }
        throw err;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [onDelta, onDone, onError]
  );

  return { sendRequest, abort };
}
