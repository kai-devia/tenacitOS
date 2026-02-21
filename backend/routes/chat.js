const express = require('express');
const http = require('http');
const db = require('../db');
const router = express.Router();

// Desde Docker, el host es accesible via la gateway de la red Docker
// 172.19.0.1 = host desde kai-network; fallback a HOST_GATEWAY env var
const OPENCLAW_HOST = process.env.OPENCLAW_GATEWAY_HOST || '172.19.0.1';
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
const SESSION_USER   = 'kai-doc-pwa'; // stable session key via OpenClaw user field

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

// ── POST /api/chat/send — SSE streaming ───────────────────────────────────
router.post('/send', (req, res) => {
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

  // Call OpenClaw /v1/chat/completions with stream:true
  const body = JSON.stringify({
    model: 'openclaw:main',
    messages: [{ role: 'user', content: message.trim() }],
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

  const proxyReq = http.request(options, (proxyRes) => {
    let buffer = '';

    proxyRes.on('error', (err) => {
      console.error(`[chat] proxyRes error: ${err.message}`);
    });

    proxyRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') {
          // Save full assistant response
          const assistantMsg = db.prepare(
            "INSERT INTO chat_messages (role, content) VALUES ('assistant', ?) RETURNING *"
          ).get(assistantText);
          res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
          res.end();
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
          // ignore parse errors in stream
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
    });
  });

  proxyReq.on('error', (err) => {
    console.error('OpenClaw proxy error:', err.message);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  });

  proxyReq.write(body);
  proxyReq.end();
});

module.exports = router;
