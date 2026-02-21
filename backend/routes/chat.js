const express = require('express');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db');
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
async function streamToOpenClaw(message, res) {
  const body = JSON.stringify({
    model: 'openclaw:main',
    messages: [{ role: 'user', content: message }],
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
      'x-openclaw-agent-id': 'main',
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

  // Save user message
  const userMsg = db.prepare(
    "INSERT INTO chat_messages (role, content) VALUES ('user', ?) RETURNING *"
  ).get(message.trim());

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Emit user message id so client can render it immediately
  res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg })}\n\n`);

  // Stream response from OpenClaw
  try {
    await streamToOpenClaw(message.trim(), res);
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

  // Save user message with transcript
  const userMsg = db.prepare(
    "INSERT INTO chat_messages (role, content) VALUES ('user', ?) RETURNING *"
  ).get(transcript.trim());

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

  // Stream response from OpenClaw
  try {
    await streamToOpenClaw(transcript.trim(), res);
  } catch (err) {
    console.error('Error streaming response:', err);
  }
});

module.exports = router;
module.exports.streamToOpenClaw = streamToOpenClaw;
