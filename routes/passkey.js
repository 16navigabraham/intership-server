import express from 'express';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import { requireAdmin } from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();

// RP (Relying Party) identity — must match the deployed domain
const rpName = process.env.RP_NAME;
const rpID = process.env.RP_ID ;
const origin = (process.env.RP_ORIGIN )
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const JWT_SECRET = process.env.JWT_SECRET;
const CHECKIN_TOKEN_TTL_SEC = 60; // passkey auth token valid for 60s — just long enough to submit

// short-lived challenge store: key = `reg:${internId}` or `auth:${matric}`
const challenges = new Map();
function setChallenge(key, value, ttlMs = 2 * 60 * 1000) {
  challenges.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function getChallenge(key) {
  const entry = challenges.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challenges.delete(key);
    return null;
  }
  return entry.value;
}
function clearChallenge(key) {
  challenges.delete(key);
}
// cleanup expired challenges hourly
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (now > v.expiresAt) challenges.delete(k);
  }
}, 60 * 60 * 1000);

async function findInternByMatric(matric) {
  const r = await db.execute({
    sql: 'SELECT id, Matriculation_Number, full_name, email, status, is_active FROM interns WHERE Matriculation_Number = ?',
    args: [matric],
  });
  return r.rows[0] || null;
}
async function findInternByEmail(email) {
  const r = await db.execute({
    sql: 'SELECT id, Matriculation_Number, full_name, email, status, is_active FROM interns WHERE lower(email) = lower(?)',
    args: [email],
  });
  return r.rows[0] || null;
}
async function findCredentialsByInternId(internId) {
  const r = await db.execute({
    sql: 'SELECT credential_id, public_key, counter, transports FROM passkey_credentials WHERE intern_id = ?',
    args: [internId],
  });
  return r.rows;
}
async function hasPasskey(internId) {
  const r = await db.execute({
    sql: 'SELECT 1 FROM passkey_credentials WHERE intern_id = ? LIMIT 1',
    args: [internId],
  });
  return r.rows.length > 0;
}

// --- REGISTRATION ---

/* Start registration — caller provides matric (intern must exist). */
router.post('/register/options', async (req, res, next) => {
  try {
    const { Matriculation_Number, allowReplace } = req.body;
    if (!Matriculation_Number) return res.status(400).json({ error: 'Matriculation_Number required' });

    const intern = await findInternByMatric(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });

    if (!allowReplace && (await hasPasskey(intern.id))) {
      return res.status(409).json({ error: 'passkey already registered for this intern' });
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(String(intern.id)),
      userName: intern.email || intern.Matriculation_Number,
      userDisplayName: intern.full_name || intern.Matriculation_Number,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    setChallenge(`reg:${intern.id}`, options.challenge);
    res.json(options);
  } catch (err) { next(err); }
});

/* Finish registration — verify and store credential. */
router.post('/register/verify', async (req, res, next) => {
  try {
    const { Matriculation_Number, response } = req.body;
    if (!Matriculation_Number || !response) return res.status(400).json({ error: 'Matriculation_Number and response required' });

    const intern = await findInternByMatric(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });

    const expectedChallenge = getChallenge(`reg:${intern.id}`);
    if (!expectedChallenge) return res.status(400).json({ error: 'challenge expired — try again' });

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'passkey verification failed' });
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;
    const transports = response.response?.transports ? JSON.stringify(response.response.transports) : null;

    await db.execute({
      sql: `INSERT INTO passkey_credentials (intern_id, credential_id, public_key, counter, transports, device_type)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        intern.id,
        credential.id,
        Buffer.from(credential.publicKey).toString('base64'),
        credential.counter,
        transports,
        credentialDeviceType,
      ],
    });

    clearChallenge(`reg:${intern.id}`);
    res.json({ verified: true });
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'this credential is already registered' });
    }
    next(err);
  }
});

// --- AUTHENTICATION (for check-in/check-out) ---

/* Start auth — caller provides matric. */
router.post('/auth/options', async (req, res, next) => {
  try {
    const { Matriculation_Number } = req.body;
    if (!Matriculation_Number) return res.status(400).json({ error: 'Matriculation_Number required' });

    const intern = await findInternByMatric(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });

    const creds = await findCredentialsByInternId(intern.id);
    if (creds.length === 0) return res.status(404).json({ error: 'no passkey registered for this intern' });

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: creds.map((c) => ({
        id: c.credential_id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
    });

    setChallenge(`auth:${intern.id}`, options.challenge);
    res.json(options);
  } catch (err) { next(err); }
});

/* Finish auth — verify, return a short-lived check-in token. */
router.post('/auth/verify', async (req, res, next) => {
  try {
    const { Matriculation_Number, response } = req.body;
    if (!Matriculation_Number || !response) return res.status(400).json({ error: 'Matriculation_Number and response required' });

    const intern = await findInternByMatric(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });

    const expectedChallenge = getChallenge(`auth:${intern.id}`);
    if (!expectedChallenge) return res.status(400).json({ error: 'challenge expired — try again' });

    const credRow = await db.execute({
      sql: 'SELECT id, credential_id, public_key, counter, transports FROM passkey_credentials WHERE credential_id = ? AND intern_id = ?',
      args: [response.id, intern.id],
    });
    const cred = credRow.rows[0];
    if (!cred) return res.status(404).json({ error: 'credential not recognized' });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64')),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) return res.status(400).json({ error: 'passkey auth failed' });

    // update counter + last used
    await db.execute({
      sql: 'UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ?',
      args: [verification.authenticationInfo.newCounter, new Date().toISOString(), cred.id],
    });

    clearChallenge(`auth:${intern.id}`);

    // Issue a short-lived check-in token
    if (!JWT_SECRET) return res.status(500).json({ error: 'JWT_SECRET not configured' });
    const token = jwt.sign(
      { kind: 'checkin', internId: intern.id, matric: intern.Matriculation_Number },
      JWT_SECRET,
      { expiresIn: `${CHECKIN_TOKEN_TTL_SEC}s` }
    );

    res.json({ verified: true, token, expiresIn: CHECKIN_TOKEN_TTL_SEC });
  } catch (err) { next(err); }
});

// --- ADMIN: reset a passkey ---

router.delete('/:internId', requireAdmin, async (req, res, next) => {
  try {
    const internId = Number(req.params.internId);
    if (!internId) return res.status(400).json({ error: 'invalid intern id' });

    const result = await db.execute({
      sql: 'DELETE FROM passkey_credentials WHERE intern_id = ?',
      args: [internId],
    });
    res.json({ cleared: result.rowsAffected });
  } catch (err) { next(err); }
});

// --- UPDATE: matric-based passkey replacement (no verification needed) ---

/* Public: intern can update/replace their passkey using matric number. */
router.post('/update', async (req, res, next) => {
  try {
    const { Matriculation_Number } = req.body;
    if (!Matriculation_Number) return res.status(400).json({ error: 'Matriculation_Number required' });

    const intern = await findInternByMatric(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });

    // Clear any existing passkey
    await db.execute({
      sql: 'DELETE FROM passkey_credentials WHERE intern_id = ?',
      args: [intern.id],
    });

    // Generate fresh registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(String(intern.id)),
      userName: intern.email || intern.Matriculation_Number,
      userDisplayName: intern.full_name || intern.Matriculation_Number,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    setChallenge(`reg:${intern.id}`, options.challenge);
    res.json({ options, Matriculation_Number: intern.Matriculation_Number, message: 'old passkey cleared, register new one' });
  } catch (err) { next(err); }
});

// --- RECOVERY: email-based re-registration ---

/* Public: check if an email is eligible for recovery (admin must have cleared the passkey first). */
router.post('/recovery/start', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const intern = await findInternByEmail(email);
    // Deliberately vague error to avoid email enumeration
    if (!intern) return res.status(400).json({ error: 'cannot proceed with this email' });
    if (await hasPasskey(intern.id)) return res.status(400).json({ error: 'cannot proceed with this email' });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(String(intern.id)),
      userName: intern.email || intern.Matriculation_Number,
      userDisplayName: intern.full_name || intern.Matriculation_Number,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    setChallenge(`reg:${intern.id}`, options.challenge);
    // Return options + the matric so the client can finalise via /register/verify
    res.json({ options, Matriculation_Number: intern.Matriculation_Number });
  } catch (err) { next(err); }
});

export default router;

// Exported for use by attendance routes — verifies the short-lived check-in token
export function verifyCheckinToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.kind !== 'checkin') return null;
    return payload; // { kind, internId, matric, iat, exp }
  } catch {
    return null;
  }
}
