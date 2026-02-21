const chokidar = require('chokidar');
const path = require('path');
const { workspaceRoot } = require('../config/env');

// Store WebSocket clients
const clients = new Set();

// Excluded directories
const EXCLUDED = ['kai-doc-pwa', 'Incursion', 'node_modules', '.git'];

let watcher = null;

/**
 * Initialize file watcher
 */
function initWatcher() {
  if (watcher) return;

  watcher = chokidar.watch(workspaceRoot, {
    ignored: [
      /(^|[\/\\])\../,  // dotfiles
      ...EXCLUDED.map(d => path.join(workspaceRoot, d)),
      '**/node_modules/**',
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 10,
  });

  watcher.on('change', (filePath) => {
    if (!filePath.endsWith('.md')) return;

    const relativePath = path.relative(workspaceRoot, filePath);
    broadcast({
      type: 'file_changed',
      path: relativePath,
    });
  });

  watcher.on('add', (filePath) => {
    if (!filePath.endsWith('.md')) return;

    const relativePath = path.relative(workspaceRoot, filePath);
    broadcast({
      type: 'file_added',
      path: relativePath,
    });
  });

  watcher.on('unlink', (filePath) => {
    if (!filePath.endsWith('.md')) return;

    const relativePath = path.relative(workspaceRoot, filePath);
    broadcast({
      type: 'file_deleted',
      path: relativePath,
    });
  });

  console.log('👁️  File watcher initialized');
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  }
}

/**
 * Add WebSocket client
 */
function addClient(ws) {
  clients.add(ws);
  console.log(`📡 Client connected (total: ${clients.size})`);
}

/**
 * Remove WebSocket client
 */
function removeClient(ws) {
  clients.delete(ws);
  console.log(`📡 Client disconnected (total: ${clients.size})`);
}

/**
 * Get connected clients count
 */
function getClientCount() {
  return clients.size;
}

module.exports = {
  initWatcher,
  broadcast,
  addClient,
  removeClient,
  getClientCount,
};
