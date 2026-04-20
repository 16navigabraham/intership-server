import crypto from 'crypto';

export function apiKey(req, res, next) {
  const provided = req.headers['x-api-key'];
  const expected = process.env.API_KEY;

  if (!provided || !expected) {
    return res.status(401).json({ error: 'invalid api key' });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'invalid api key' });
  }

  next();
}
