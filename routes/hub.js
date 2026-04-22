import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();

function callerIp(req) {
  return req.ip?.replace('::ffff:', '') || null;
}

/* admin: sync the current hub IP — records the caller's IP as the allowed hub */
router.post('/sync-ip', requireAdmin, async (req, res, next) => {
  try {
    const ip = callerIp(req);
    if (!ip) return res.status(400).json({ error: 'could not determine caller ip' });

    const now = new Date().toISOString();
    const who = req.admin?.email || 'admin';

    await db.execute({
      sql: 'UPDATE hub_config SET current_ip = ?, updated_at = ?, updated_by = ? WHERE id = 1',
      args: [ip, now, who],
    });

    res.json({ current_ip: ip, updated_at: now, updated_by: who });
  } catch (err) { next(err); }
});

/* admin: read the current hub IP config */
router.get('/ip', requireAdmin, async (req, res, next) => {
  try {
    const result = await db.execute('SELECT current_ip, updated_at, updated_by FROM hub_config WHERE id = 1');
    const row = result.rows[0] || {};
    res.json({
      current_ip: row.current_ip || null,
      updated_at: row.updated_at || null,
      updated_by: row.updated_by || null,
      caller_ip: callerIp(req),
    });
  } catch (err) { next(err); }
});

export default router;
