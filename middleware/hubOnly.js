/**
 * Restricts access to requests coming from the hub's Starlink IP(s).
 * Configure via env var HUB_IPS as a comma-separated list, e.g.
 *   HUB_IPS=143.105.174.155,102.89.32.14
 */
export function hubOnly(req, res, next) {
  const allowed = (process.env.HUB_IPS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    return res.status(500).json({ error: 'HUB_IPS not configured' });
  }

  // req.ip respects `app.set('trust proxy', 1)` and reads X-Forwarded-For
  const source = req.ip?.replace('::ffff:', ''); // strip IPv6 prefix on IPv4 addrs

  if (!allowed.includes(source)) {
    return res.status(403).json({ error: 'check-in only allowed from hub network' });
  }
  next();
}
