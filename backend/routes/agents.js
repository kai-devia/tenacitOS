const express = require('express');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/agents
 * Devuelve el único agente disponible
 */
router.get('/', (req, res) => {
  res.json([
    { id: 'kai', name: 'Kai', emoji: '🤖' }
  ]);
});

module.exports = router;
