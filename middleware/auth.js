import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function checkApiKey(provided) {
  const expected = process.env.API_KEY;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function checkJwt(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  if (checkApiKey(req.headers['x-api-key'])) return next();

  const payload = checkJwt(req.headers.authorization);
  if (payload) {
    req.admin = payload;
    return next();
  }

  return res.status(401).json({ error: 'unauthorized' });
}
