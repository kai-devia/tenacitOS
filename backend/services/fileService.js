const fs = require('fs').promises;
const path = require('path');
const { workspaceRoot } = require('../config/env');

// Directories and files to exclude from the tree
const EXCLUDED = new Set([
  'kai-doc-pwa',
  'Incursion',
  'node_modules',
  'BOOTSTRAP.md',
  '.git',
]);

// Priority files (shown first in this order)
const PRIORITY_FILES = [
  'MEMORY.md',
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'memory/contexts/_index.md',
  'memory/contexts/projects/_index.md',
  'memory/contexts/projects/erythia.md',
  'memory/contexts/projects/kai-doc-pwa.md',
];

/**
 * Check if a path is safe (within workspace root)
 */
function isSafePath(relativePath) {
  const resolved = path.resolve(workspaceRoot, relativePath);
  return resolved.startsWith(workspaceRoot) && !relativePath.includes('..');
}

/**
 * Recursively build file tree
 */
async function buildTree(dir, relativePath = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    const name = entry.name;
    const entryRelPath = relativePath ? `${relativePath}/${name}` : name;

    // Skip excluded entries
    if (EXCLUDED.has(name)) continue;

    if (entry.isDirectory()) {
      const children = await buildTree(path.join(dir, name), entryRelPath);
      // Only include directories that have .md files (directly or nested)
      if (children.length > 0) {
        items.push({
          name,
          path: entryRelPath,
          type: 'dir',
          children,
        });
      }
    } else if (name.endsWith('.md')) {
      const stat = await fs.stat(path.join(dir, name));
      items.push({
        name,
        path: entryRelPath,
        type: 'file',
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  return items;
}

/**
 * Sort tree with priority files first
 */
function sortTree(items) {
  const priorityMap = new Map();
  PRIORITY_FILES.forEach((p, i) => priorityMap.set(p, i));

  // Separate daily files (memory/YYYY-MM-DD.md) for special sorting
  const isDailyFile = (path) => /^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(path);

  return items.sort((a, b) => {
    const aIdx = priorityMap.has(a.path) ? priorityMap.get(a.path) : 1000;
    const bIdx = priorityMap.has(b.path) ? priorityMap.get(b.path) : 1000;

    // Both are priority files
    if (aIdx < 1000 || bIdx < 1000) {
      return aIdx - bIdx;
    }

    // Both are daily files - sort by date descending
    if (isDailyFile(a.path) && isDailyFile(b.path)) {
      return b.path.localeCompare(a.path);
    }

    // One is daily file
    if (isDailyFile(a.path)) return -1;
    if (isDailyFile(b.path)) return 1;

    // Alphabetical
    return a.name.localeCompare(b.name);
  }).map(item => {
    if (item.type === 'dir' && item.children) {
      return { ...item, children: sortTree(item.children) };
    }
    return item;
  });
}

/**
 * Get file tree
 */
async function getFileTree() {
  const tree = await buildTree(workspaceRoot);
  return sortTree(tree);
}

/**
 * Flatten tree to sorted list for dashboard
 */
function flattenTree(items, result = []) {
  for (const item of items) {
    if (item.type === 'file') {
      result.push(item);
    } else if (item.children) {
      flattenTree(item.children, result);
    }
  }
  return result;
}

/**
 * Get file content
 */
async function getFileContent(relativePath) {
  if (!isSafePath(relativePath)) {
    throw new Error('Ruta no permitida');
  }

  const fullPath = path.join(workspaceRoot, relativePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const stat = await fs.stat(fullPath);

  return {
    content,
    mtime: stat.mtime.toISOString(),
  };
}

/**
 * Write file content
 */
async function writeFileContent(relativePath, content) {
  if (!isSafePath(relativePath)) {
    throw new Error('Ruta no permitida');
  }

  if (!relativePath.endsWith('.md')) {
    throw new Error('Solo se pueden editar archivos .md');
  }

  const fullPath = path.join(workspaceRoot, relativePath);
  await fs.writeFile(fullPath, content, 'utf-8');

  return { ok: true };
}

module.exports = {
  getFileTree,
  flattenTree,
  getFileContent,
  writeFileContent,
  workspaceRoot,
};
