import db from '../config/db.js';

/**
 * Restricts access to requests coming from the hub's Starlink IP.
 * Reads the current allowed IP from the hub_config table (updated by admins
 * via POST /admin/sync-ip when Starlink reboots and gets a new IP).
 *
 * Falls back to env HUB_IPS (comma-separated) for bootstrap / emergency use.
 */
export async function hubOnly(req, res, next) {
  try {
    const source = req.ip?.replace('::ffff:', '');
    if (!source) return res.status(400).json({ error: 'could not determine source ip' });

    const result = await db.execute('SELECT current_ip FROM hub_config WHERE id = 1');
    const dbIp = result.rows[0]?.current_ip;

    const fallback = (process.env.HUB_IPS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const allowed = [dbIp, ...fallback].filter(Boolean);

    if (allowed.length === 0) {
      return res.status(500).json({ error: 'hub IP not configured — admin must sync from hub' });
    }

    if (!allowed.includes(source)) {
      return res.status(403).json({ error: 'check-in only allowed from hub network' });
    }
    next();
  } catch (err) { next(err); }
}
