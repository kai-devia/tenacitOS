const express = require('express');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db');
const { broadcast } = require('../services/watcherService');
const router = express.Router();

// Multer config for audio
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Desde Docker, el host es accesible via la gateway de la red Docker
// 172.19.0.1 = host desde kai-network; fallback a HOST_GATEWAY env var
const OPENCLAW_HOST = process.env.OPENCLAW_GATEWAY_HOST || '172.19.0.1';
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
const SESSION_USER   = 'kai-doc-pwa'; // stable session key via OpenClaw user field
const WHISPER_HOST = process.env.WHISPER_HOST || '172.19.0.1';
const WHISPER_PORT = process.env.WHISPER_PORT || 9876;

// ── System Prompt — built dynamically on each request ────────────────────
// Reads workspace files fresh each time so MEMORY.md changes are reflected immediately
function buildSystemPrompt() {
  const WORKSPACE = '/workspace';
  const read = (f) => { try { return fs.readFileSync(path.join(WORKSPACE, f), 'utf8'); } catch { return ''; } };

  const soul     = read('SOUL.md');
  const identity = read('IDENTITY.md');
  const user     = read('USER.md');
  const memory   = read('MEMORY.md');
  const agents   = read('AGENTS.md');

  // Today's daily notes for recency
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dailyToday = read(`memory/${today}.md`);
  const dailyYesterday = read(`memory/${yesterday}.md`);

  const dailyContext = [
    dailyToday     ? `## Notas de hoy (${today})\n${dailyToday}`     : '',
    dailyYesterday ? `## Notas de ayer (${yesterday})\n${dailyYesterday}` : '',
  ].filter(Boolean).join('\n\n');

  return `${identity}

${soul}

${user}

## Long-term Memory & Context
${memory}

${dailyContext}

## Rules & Workspace Instructions
${agents}

## Interface
Estás respondiendo desde la Kai PWA (http://localhost) — interfaz web directa con Guille.
Mismo comportamiento, misma personalidad, mismo contexto que en Telegram.
Responde siempre en español salvo que Guille cambie el idioma.
Tienes acceso completo a herramientas: exec, read, write, browser, etc.`;
}

console.log('[chat] system prompt will be built dynamically per request');

// ── GET /api/chat/history ─────────────────────────────────────────────────
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const msgs = db.prepare(
      'SELECT * FROM chat_messages ORDER BY id DESC LIMIT ?'
    ).all(limit).reverse();
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/chat/history ──────────────────────────────────────────────
router.delete('/history', (req, res) => {
  try {
    db.prepare('DELETE FROM chat_messages').run();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: Stream message to OpenClaw via SSE ──────────────────────────
async function streamToOpenClaw(message, res, history = []) {
  // System prompt built fresh each request — reflects latest MEMORY.md, daily notes, etc.
  const systemPrompt = buildSystemPrompt();

  // Build messages array: system + history + current user message
  const historyMessages = history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: message },
  ];

  const body = JSON.stringify({
    model: 'openclaw',
    messages,
    stream: true,
    user: SESSION_USER,
  });

  const options = {
    hostname: OPENCLAW_HOST,
    port: 18789,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'x-openclaw-agent-id': 'pwa',
    },
  };

  let assistantText = '';

  return new Promise((resolve, reject) => {
    const proxyReq = http.request(options, (proxyRes) => {
      let buffer = '';

      proxyRes.on('error', (err) => {
        console.error(`[chat] proxyRes error: ${err.message}`);
      });

      proxyRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') {
            const assistantMsg = db.prepare(
              "INSERT INTO chat_messages (role, content) VALUES ('assistant', ?) RETURNING *"
            ).get(assistantText);
            broadcast({ type: 'chat_message', message: assistantMsg });
            res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
            res.end();
            resolve();
            return;
          }
          try {
            const event = JSON.parse(raw);
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
            }
          } catch {
            // ignore parse errors
          }
        }
      });

      proxyRes.on('end', () => {
        if (assistantText && !res.writableEnded) {
          const assistantMsg = db.prepare(
            "INSERT INTO chat_messages (role, content) VALUES ('assistant', ?) RETURNING *"
          ).get(assistantText);
          broadcast({ type: 'chat_message', message: assistantMsg });
          res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
          res.end();
        }
        resolve();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('OpenClaw proxy error:', err.message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      }
      reject(err);
    });

    proxyReq.write(body);
    proxyReq.end();
  });
}

// ── POST /api/chat/send — SSE streaming ───────────────────────────────────
router.post('/send', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'message required' });
  }

  // Load recent conversation history (last 40 messages = 20 turns) before saving current
  const history = db.prepare(
    'SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 40'
  ).all().reverse();

  // Save user message
  const userMsg = db.prepare(
    "INSERT INTO chat_messages (role, content) VALUES ('user', ?) RETURNING *"
  ).get(message.trim());

  // Broadcast to other connected clients
  broadcast({ type: 'chat_message', message: userMsg });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Emit user message id so client can render it immediately
  res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg })}\n\n`);

  // Stream response from OpenClaw (with history for conversational context)
  try {
    await streamToOpenClaw(message.trim(), res, history);
  } catch (err) {
    console.error('Error streaming response:', err);
  }
});

// ── Helper: Transcribe audio via Whisper server ─────────────────────────
async function transcribeAudio(audioBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm';
    const options = {
      hostname: WHISPER_HOST,
      port: WHISPER_PORT,
      path: '/transcribe',
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'audio/webm',
        'Content-Length': audioBuffer.length,
        'X-Audio-Format': ext,
      },
      timeout: 125000, // 125s timeout (Whisper max is 120s)
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data.trim());
        } else {
          reject(new Error(`Whisper error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Whisper transcription timeout'));
    });

    req.write(audioBuffer);
    req.end();
  });
}

// ── POST /api/chat/send-audio — Audio transcription + SSE streaming ──────
router.post('/send-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'audio file required' });
  }

  // Transcribe audio
  let transcript;
  try {
    transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error('Transcription error:', err.message);
    return res.status(500).json({ error: `Transcription failed: ${err.message}` });
  }

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'No se detectó audio en la grabación' });
  }

  // Load recent conversation history before saving current
  const history = db.prepare(
    'SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 40'
  ).all().reverse();

  // Save user message with transcript
  const userMsg = db.prepare(
    "INSERT INTO chat_messages (role, content) VALUES ('user', ?) RETURNING *"
  ).get(transcript.trim());

  // Broadcast to other connected clients
  broadcast({ type: 'chat_message', message: userMsg });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Emit transcript event so client knows what was transcribed
  res.write(`data: ${JSON.stringify({ type: 'transcript', text: transcript.trim() })}\n\n`);

  // Emit user message id
  res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg })}\n\n`);

  // Stream response from OpenClaw (with history for conversational context)
  try {
    await streamToOpenClaw(transcript.trim(), res, history);
  } catch (err) {
    console.error('Error streaming response:', err);
  }
});

// ── POST /api/chat/send-image — Image + optional text → SSE streaming ───────
router.post('/send-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image file required' });
  }

  const caption = (req.body.message || '').trim();
  const base64 = req.file.buffer.toString('base64');
  const mediaType = req.file.mimetype || 'image/jpeg';

  // Validate image mime type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(mediaType)) {
    return res.status(400).json({ error: `Tipo de imagen no soportado: ${mediaType}` });
  }

  // The text stored in DB (no binary data)
  const dbContent = caption ? `[Imagen] ${caption}` : '[Imagen]';

  // Load recent history
  const history = db.prepare(
    'SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 40'
  ).all().reverse();

  // Save user message
  const userMsg = db.prepare(
    "INSERT INTO chat_messages (role, content) VALUES ('user', ?) RETURNING *"
  ).get(dbContent);

  broadcast({ type: 'chat_message', message: userMsg });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Emit user message id so client can map the optimistic message
  res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg })}\n\n`);

  // Build multimodal content — OpenAI vision format (data URL)
  // OpenClaw uses the OpenAI-compatible endpoint, so we use image_url not Anthropic's source format
  const imageContent = [
    {
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${base64}` },
    },
  ];
  if (caption) {
    imageContent.push({ type: 'text', text: caption });
  } else {
    imageContent.push({ type: 'text', text: 'Describe esta imagen en detalle.' });
  }

  // Stream vision response
  try {
    await streamWithContent(imageContent, res, history);
  } catch (err) {
    console.error('Error streaming image response:', err);
  }
});

/**
 * Like streamToOpenClaw but accepts a multimodal content array for vision.
 */
async function streamWithContent(userContent, res, history = []) {
  const systemPrompt = buildSystemPrompt();

  const historyMessages = history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  const body = JSON.stringify({
    model: 'openclaw',
    messages,
    stream: true,
    user: SESSION_USER,
  });

  const options = {
    hostname: OPENCLAW_HOST,
    port: 18789,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'x-openclaw-agent-id': 'pwa',
    },
  };

  let assistantText = '';

  return new Promise((resolve, reject) => {
    const proxyReq = http.request(options, (proxyRes) => {
      let buffer = '';

      proxyRes.on('error', (err) => {
        console.error(`[chat/image] proxyRes error: ${err.message}`);
      });

      proxyRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') {
            const assistantMsg = db.prepare(
              "INSERT INTO chat_messages (role, content) VALUES ('assistant', ?) RETURNING *"
            ).get(assistantText);
            broadcast({ type: 'chat_message', message: assistantMsg });
            res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
            res.end();
            resolve();
            return;
          }
          try {
            const event = JSON.parse(raw);
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
            }
          } catch { /* ignore */ }
        }
      });

      proxyRes.on('end', () => {
        if (assistantText && !res.writableEnded) {
          const assistantMsg = db.prepare(
            "INSERT INTO chat_messages (role, content) VALUES ('assistant', ?) RETURNING *"
          ).get(assistantText);
          broadcast({ type: 'chat_message', message: assistantMsg });
          res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
          res.end();
        }
        resolve();
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[chat/image] OpenClaw proxy error:', err.message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      }
      reject(err);
    });

    proxyReq.write(body);
    proxyReq.end();
  });
}

module.exports = router;
module.exports.streamToOpenClaw = streamToOpenClaw;
