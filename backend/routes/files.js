const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { getFileTree, getFileContent, writeFileContent, flattenTree } = require('../services/fileService');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/files
 * Returns file tree of .md files
 */
router.get('/', async (req, res) => {
  try {
    const tree = await getFileTree();
    res.json(tree);
  } catch (err) {
    console.error('Error getting file tree:', err);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

/**
 * GET /api/files/flat
 * Returns flat sorted list of files for dashboard
 */
router.get('/flat', async (req, res) => {
  try {
    const tree = await getFileTree();
    const flat = flattenTree(tree);
    res.json(flat);
  } catch (err) {
    console.error('Error getting flat file list:', err);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

/**
 * GET /api/content?path=relative/path.md
 * Returns file content
 */
router.get('/content', async (req, res) => {
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Ruta requerida' });
  }

  try {
    const result = await getFileContent(path);
    res.json(result);
  } catch (err) {
    console.error('Error reading file:', err);
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    res.status(500).json({ error: err.message || 'Error al leer archivo' });
  }
});

/**
 * PUT /api/content?path=relative/path.md
 * Updates file content
 */
router.put('/content', async (req, res) => {
  const { path } = req.query;
  const { content } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Ruta requerida' });
  }

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Contenido requerido' });
  }

  try {
    const result = await writeFileContent(path, content);
    res.json(result);
  } catch (err) {
    console.error('Error writing file:', err);
    res.status(500).json({ error: err.message || 'Error al escribir archivo' });
  }
});

module.exports = router;
