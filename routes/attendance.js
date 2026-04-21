import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { hubOnly } from '../middleware/hubOnly.js';
import db from '../config/db.js';

const router = express.Router();

function todayISO() {
  // YYYY-MM-DD in server local time
  return new Date().toISOString().slice(0, 10);
}

function isWorkday(date = new Date()) {
  // Mon(1) – Thu(4)
  const d = date.getDay();
  return d >= 1 && d <= 4;
}

async function findIntern(matric) {
  const result = await db.execute({
    sql: 'SELECT id, is_active, cohort_year FROM interns WHERE Matriculation_Number = ?',
    args: [matric],
  });
  return result.rows[0];
}

/* intern: check in — requires hub IP */
router.post('/check-in', hubOnly, async (req, res, next) => {
  try {
    const { Matriculation_Number } = req.body;
    if (!Matriculation_Number) {
      return res.status(400).json({ error: 'Matriculation_Number required' });
    }
    if (!isWorkday()) {
      return res.status(400).json({ error: 'attendance only Mon–Thu' });
    }

    const intern = await findIntern(Matriculation_Number);
    if (!intern) return res.status(404).json({ error: 'intern not found' });
    if (!intern.is_active) return res.status(403).json({ error: 'not an admitted intern' });

    const date = todayISO();
    const time_in = new Date().toISOString();

    try {
      await db.execute({
        sql: 'INSERT INTO attendance (Matriculation_Number, date, time_in, cohort_year) VALUES (?, ?, ?, ?)',
        args: [Matriculation_Number, date, time_in, intern.cohort_year],
      });
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) {
        return res.status(409).json({ error: 'already checked in today' });
      }
      throw err;
    }

    res.json({ Matriculation_Number, date, time_in });
  } catch (err) { next(err); }
});

/* intern: check out — requires hub IP */
router.patch('/check-out', hubOnly, async (req, res, next) => {
  try {
    const { Matriculation_Number } = req.body;
    if (!Matriculation_Number) {
      return res.status(400).json({ error: 'Matriculation_Number required' });
    }

    const date = todayISO();
    const time_out = new Date().toISOString();

    const existing = await db.execute({
      sql: 'SELECT time_in, time_out FROM attendance WHERE Matriculation_Number = ? AND date = ?',
      args: [Matriculation_Number, date],
    });
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: 'no check-in found for today' });
    if (row.time_out) return res.status(409).json({ error: 'already checked out today' });

    const hours = (new Date(time_out) - new Date(row.time_in)) / (1000 * 60 * 60);

    await db.execute({
      sql: 'UPDATE attendance SET time_out = ?, hours = ? WHERE Matriculation_Number = ? AND date = ?',
      args: [time_out, Number(hours.toFixed(2)), Matriculation_Number, date],
    });

    res.json({ Matriculation_Number, date, time_out, hours: Number(hours.toFixed(2)) });
  } catch (err) { next(err); }
});

/* status for the check-in page — hub-only so it can't be used to enumerate matric numbers */
router.get('/status', hubOnly, async (req, res, next) => {
  try {
    const matric = req.query.matric;
    if (!matric) return res.status(400).json({ error: 'matric query param required' });

    const intern = await findIntern(matric);
    if (!intern) {
      return res.json({ found: false, admitted: false, state: 'unknown' });
    }
    if (!intern.is_active) {
      return res.json({ found: true, admitted: false, state: 'not_admitted' });
    }

    const today = await db.execute({
      sql: 'SELECT time_in, time_out FROM attendance WHERE Matriculation_Number = ? AND date = ?',
      args: [matric, todayISO()],
    });
    const row = today.rows[0];

    let state = 'not_checked_in';
    if (row && row.time_in && !row.time_out) state = 'checked_in';
    if (row && row.time_out) state = 'checked_out';

    res.json({
      found: true,
      admitted: true,
      state,
      time_in: row?.time_in ?? null,
      time_out: row?.time_out ?? null,
      is_workday: isWorkday(),
    });
  } catch (err) { next(err); }
});

/* intern: my attendance history */
router.get('/me', async (req, res, next) => {
  try {
    const matric = req.query.matric;
    if (!matric) return res.status(400).json({ error: 'matric query param required' });

    const result = await db.execute({
      sql: 'SELECT date, time_in, time_out, hours FROM attendance WHERE Matriculation_Number = ? ORDER BY date DESC',
      args: [matric],
    });
    res.json(result.rows);
  } catch (err) { next(err); }
});

/* admin: per-intern totals for a cohort year (defaults to current year) */
router.get('/summary', requireAdmin, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const result = await db.execute({
      sql: `SELECT a.Matriculation_Number, i.full_name, i.Department,
                   COUNT(a.date) AS days_present,
                   ROUND(COALESCE(SUM(a.hours), 0), 2) AS total_hours
            FROM attendance a
            JOIN interns i ON i.Matriculation_Number = a.Matriculation_Number
            WHERE a.cohort_year = ?
            GROUP BY a.Matriculation_Number
            ORDER BY total_hours DESC`,
      args: [year],
    });
    res.json(result.rows);
  } catch (err) { next(err); }
});

export default router;
