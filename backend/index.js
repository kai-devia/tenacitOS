const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const { port } = require('./config/env');
const { verifyToken } = require('./middlewares/auth');
const { initWatcher, addClient, removeClient } = require('./services/watcherService');

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const tasksRoutes = require('./routes/tasks');
const eventsRoutes = require('./routes/events');
const systemRoutes = require('./routes/system');
const chatRoutes   = require('./routes/chat');
const vaultRoutes  = require('./routes/vault');

// Initialize SQLite database (creates tables + seed data on first run)
require('./db');

// Initialize Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/chat',   chatRoutes);
app.use('/api/vault',  vaultRoutes);

// ── Devia Model SPA ─────────────────────────────────────────
// MUST be registered BEFORE express.static(frontendDist) to avoid
// collision with /app/public/deviamodel/ if that path ever exists.
// Served from a host volume mounted at /app/devia-model-web (ro)
const deviaModelPath = '/app/devia-model-web/dist';
app.use('/deviamodel', express.static(deviaModelPath));
app.get(['/deviamodel', '/deviamodel/', '/deviamodel/*'], (req, res) => {
  res.sendFile(path.join(deviaModelPath, 'index.html'));
});
// ────────────────────────────────────────────────────────────

// Serve static frontend (./public in Docker, ../frontend/dist in dev)
const frontendDist = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'frontend', 'dist');

app.use(express.static(frontendDist));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`🚀 KAI DOC PWA server running on http://localhost:${port}`);
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Verify token from query string
  const url = new URL(req.url, `http://localhost:${port}`);
  const token = url.searchParams.get('token');

  if (!token || !verifyToken(token)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  addClient(ws);

  ws.on('close', () => {
    removeClient(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    removeClient(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected' }));
});

// Initialize file watcher
initWatcher();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
