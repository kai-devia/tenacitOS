const express = require('express');
const jwt = require('jsonwebtoken');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const db = require('../db');
const { authMiddleware } = require('../middlewares/auth');
const { jwtSecret, jwtExpiry } = require('../config/env');

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Kai Doc';
const USER_ID = 'guille';

/**
 * Extracts rpID and origin dynamically from the request.
 * This allows the app to work from any domain (localhost, Cloudflare Tunnel, etc.)
 * Priority: env vars → request Origin header → fallback to localhost
 */
function getRpInfo(req) {
  // Env vars override (for stable production domains)
  if (process.env.WEBAUTHN_RP_ID && process.env.WEBAUTHN_ORIGIN) {
    return {
      rpID: process.env.WEBAUTHN_RP_ID,
      origin: process.env.WEBAUTHN_ORIGIN,
    };
  }

  // Extract from request Origin header
  const originHeader = req.headers.origin || req.headers.referer;
  if (originHeader) {
    try {
      const url = new URL(originHeader);
      return {
        rpID: url.hostname,
        origin: url.origin,
      };
    } catch (_) {
      // fall through to default
    }
  }

  // Fallback
  return {
    rpID: 'localhost',
    origin: 'http://localhost',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanOldChallenges() {
  db.prepare(`
    DELETE FROM webauthn_challenges 
    WHERE created_at < datetime('now', '-5 minutes')
  `).run();
}

function getStoredCredentials(userId) {
  return db.prepare(
    'SELECT * FROM webauthn_credentials WHERE user_id = ?'
  ).all(userId);
}

// ─── POST /register/start ─────────────────────────────────────────────────────
router.post('/register/start', authMiddleware, async (req, res) => {
  try {
    cleanOldChallenges();
    const { rpID, origin } = getRpInfo(req);

    const existingCredentials = getStoredCredentials(USER_ID);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: USER_ID,
      userName: USER_ID,
      userDisplayName: 'Guille',
      attestationType: 'none',
      excludeCredentials: existingCredentials.map(c => ({
        id: c.credential_id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    });

    // Store challenge with the domain it was created for
    db.prepare(
      'INSERT INTO webauthn_challenges (user_id, challenge, rp_id, origin) VALUES (?, ?, ?, ?)'
    ).run(USER_ID, options.challenge, rpID, origin);

    res.json(options);
  } catch (err) {
    console.error('WebAuthn register/start error:', err);
    res.status(500).json({ error: err.message || 'Error iniciando registro WebAuthn' });
  }
});

// ─── POST /register/finish ────────────────────────────────────────────────────
router.post('/register/finish', authMiddleware, async (req, res) => {
  try {
    cleanOldChallenges();

    const challengeRow = db.prepare(
      'SELECT * FROM webauthn_challenges WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).get(USER_ID);

    if (!challengeRow) {
      return res.status(400).json({ error: 'No hay challenge activo. Inicia el registro de nuevo.' });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: challengeRow.origin || 'http://localhost',
        expectedRPID: challengeRow.rp_id || 'localhost',
      });
    } catch (verifyErr) {
      db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(challengeRow.id);
      throw verifyErr;
    }

    db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(challengeRow.id);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verificación de registro fallida' });
    }

    const {
      credentialPublicKey,
      credentialID,
      counter,
      credentialDeviceType,
    } = verification.registrationInfo;

    const credIdStr = Buffer.from(credentialID).toString('base64url');
    const pubKeyStr = Buffer.from(credentialPublicKey).toString('base64url');

    const existing = db.prepare(
      'SELECT id FROM webauthn_credentials WHERE credential_id = ?'
    ).get(credIdStr);

    if (existing) {
      db.prepare(`
        UPDATE webauthn_credentials 
        SET public_key = ?, counter = ?, device_type = ?, rp_id = ?
        WHERE credential_id = ?
      `).run(pubKeyStr, counter, credentialDeviceType || '', challengeRow.rp_id || 'localhost', credIdStr);
    } else {
      db.prepare(`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_type, rp_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(USER_ID, credIdStr, pubKeyStr, counter, credentialDeviceType || '', challengeRow.rp_id || 'localhost');
    }

    console.log(`✅ WebAuthn credential registered for ${USER_ID} on rpID: ${challengeRow.rp_id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('WebAuthn register/finish error:', err);
    res.status(500).json({ error: err.message || 'Error completando registro WebAuthn' });
  }
});

// ─── POST /login/start ────────────────────────────────────────────────────────
router.post('/login/start', async (req, res) => {
  try {
    cleanOldChallenges();
    const { rpID, origin } = getRpInfo(req);

    const credentials = getStoredCredentials(USER_ID);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: credentials.map(c => ({
        id: c.credential_id,
        type: 'public-key',
      })),
    });

    db.prepare(
      'INSERT INTO webauthn_challenges (user_id, challenge, rp_id, origin) VALUES (?, ?, ?, ?)'
    ).run(USER_ID, options.challenge, rpID, origin);

    res.json({ ...options, hasCredentials: credentials.length > 0 });
  } catch (err) {
    console.error('WebAuthn login/start error:', err);
    res.status(500).json({ error: err.message || 'Error iniciando autenticación WebAuthn' });
  }
});

// ─── POST /login/finish ───────────────────────────────────────────────────────
router.post('/login/finish', async (req, res) => {
  try {
    cleanOldChallenges();

    const challengeRow = db.prepare(
      'SELECT * FROM webauthn_challenges WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).get(USER_ID);

    if (!challengeRow) {
      return res.status(400).json({ error: 'No hay challenge activo. Intenta de nuevo.' });
    }

    const credId = req.body.id;
    const credential = db.prepare(
      'SELECT * FROM webauthn_credentials WHERE credential_id = ?'
    ).get(credId);

    if (!credential) {
      db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(challengeRow.id);
      return res.status(400).json({ error: 'Credencial no encontrada. Registra tu huella primero.' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: challengeRow.origin || credential.rp_id ? `https://${credential.rp_id}` : 'http://localhost',
        expectedRPID: challengeRow.rp_id || credential.rp_id || 'localhost',
        authenticator: {
          credentialID: Buffer.from(credential.credential_id, 'base64url'),
          credentialPublicKey: Buffer.from(credential.public_key, 'base64url'),
          counter: credential.counter,
        },
      });
    } catch (verifyErr) {
      db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(challengeRow.id);
      throw verifyErr;
    }

    db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(challengeRow.id);

    if (!verification.verified) {
      return res.status(400).json({ error: 'Autenticación biométrica fallida' });
    }

    db.prepare(
      'UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?'
    ).run(verification.authenticationInfo.newCounter, credential.credential_id);

    const token = jwt.sign({ user: USER_ID }, jwtSecret, { expiresIn: jwtExpiry });

    console.log(`✅ WebAuthn login successful for ${USER_ID}`);
    res.json({ token });
  } catch (err) {
    console.error('WebAuthn login/finish error:', err);
    res.status(500).json({ error: err.message || 'Error completando autenticación WebAuthn' });
  }
});

// ─── GET /credentials ─────────────────────────────────────────────────────────
router.get('/credentials', authMiddleware, (req, res) => {
  const credentials = db.prepare(
    'SELECT id, credential_id, device_type, rp_id, created_at FROM webauthn_credentials WHERE user_id = ?'
  ).all(USER_ID);
  res.json({ credentials });
});

// ─── DELETE /credentials/:id ──────────────────────────────────────────────────
router.delete('/credentials/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const result = db.prepare(
    'DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?'
  ).run(id, USER_ID);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Credencial no encontrada' });
  }
  res.json({ ok: true });
});

module.exports = router;
