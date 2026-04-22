import  express from 'express';
import { requireAdmin } from '../middleware/auth.js';
  import cloudinary from '../config/cloudinary.js';
import multer from 'multer';
import db from '../config/db.js';

const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        return cb(new Error('only jpeg/png/webp allowed'));
      }
      cb(null, true);
    },
  });

  function uploadBuffer(buffer) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'interns' },
        (err, result) => err ? reject(err) : resolve(result.secure_url)
      ).end(buffer);
    });
  }

  router.post('/form', upload.single('photo'), async (req, res, next) => {
    try {
      const {
        Matriculation_Number,
        full_name,
        email,
        Department,
        bio,
        skills,
        expectations,
        ADDRESS,
        phone_number,
        Parent_contact,
      } = req.body;

      const photo_url = req.file ? await uploadBuffer(req.file.buffer) : null;

      const cohort_year = new Date().getFullYear();

      await db.execute({
        sql: `INSERT INTO interns
          (Matriculation_Number, full_name, email, Department, bio, photo_url, skills, expectations, ADDRESS, phone_number, Parent_contact, is_active, cohort_year)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [
          Matriculation_Number ?? null,
          full_name ?? null,
          email ?? null,
          Department ?? null,
          bio ?? null,
          photo_url,
          skills ?? null,
          expectations ?? null,
          ADDRESS ?? null,
          phone_number ?? null,
          Parent_contact ?? null,
          cohort_year,
        ],
      });
      res.json({ message: 'form submitted' });
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT') {
        const msg = err.cause?.proto?.message || err.message || '';
        if (msg.includes('interns.email')) {
          return res.status(409).json({ error: 'this email has already applied' });
        }
        if (msg.includes('interns.Matriculation_Number')) {
          return res.status(409).json({ error: 'this matric number has already applied' });
        }
        return res.status(409).json({ error: 'duplicate submission' });
      }
      next(err);
    }
  });

  /* admin: admit or reject an applicant by matric number */
  router.patch('/admit', requireAdmin, async (req, res, next) => {
    try {
      const { Matriculation_Number, admit } = req.body;
      if (!Matriculation_Number) {
        return res.status(400).json({ error: 'Matriculation_Number required' });
      }
      const value = admit ? 1 : 0;
      const status = admit ? 'admitted' : 'rejected';

      const result = await db.execute({
        sql: 'UPDATE interns SET is_active = ?, status = ? WHERE Matriculation_Number = ?',
        args: [value, status, Matriculation_Number],
      });

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: 'intern not found' });
      }
      res.json({ Matriculation_Number, is_active: value, status });
    } catch (err) { next(err); }
  });

  /* admin: list applicants (pending + admitted) for a cohort year — defaults to current year */
  router.get('/applicants', requireAdmin, async (req, res, next) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const result = await db.execute({
        sql: 'SELECT id, Matriculation_Number, full_name, email, Department, photo_url, is_active, status, cohort_year, created_at FROM interns WHERE cohort_year = ? ORDER BY created_at DESC',
        args: [year],
      });
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  /* admin: full detail on one applicant (matric has slashes, so use query) */
  router.get('/applicant', requireAdmin, async (req, res, next) => {
    try {
      const matric = req.query.matric;
      if (!matric) return res.status(400).json({ error: 'matric required' });
      const result = await db.execute({
        sql: 'SELECT id, Matriculation_Number, full_name, email, Department, bio, photo_url, skills, expectations, ADDRESS, phone_number, Parent_contact, is_active, status, cohort_year, created_at FROM interns WHERE Matriculation_Number = ?',
        args: [matric],
      });
      if (!result.rows[0]) return res.status(404).json({ error: 'not found' });
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  });

  /* admin: delete an applicant entirely (removes attendance too).
     Accepts ?matric=... or ?id=... for rows that don't have a matric. */
  router.delete('/applicant', requireAdmin, async (req, res, next) => {
    try {
      const { matric, id } = req.query;
      if (!matric && !id) {
        return res.status(400).json({ error: 'matric or id required' });
      }

      // Resolve the intern first so we can also clean attendance by matric
      const found = matric
        ? await db.execute({
            sql: 'SELECT id, Matriculation_Number FROM interns WHERE Matriculation_Number = ?',
            args: [matric],
          })
        : await db.execute({
            sql: 'SELECT id, Matriculation_Number FROM interns WHERE id = ?',
            args: [Number(id)],
          });

      const row = found.rows[0];
      if (!row) return res.status(404).json({ error: 'not found' });

      if (row.Matriculation_Number) {
        await db.execute({
          sql: 'DELETE FROM attendance WHERE Matriculation_Number = ?',
          args: [row.Matriculation_Number],
        });
      }
      await db.execute({
        sql: 'DELETE FROM interns WHERE id = ?',
        args: [row.id],
      });

      res.json({ deleted: true, id: row.id, Matriculation_Number: row.Matriculation_Number });
    } catch (err) { next(err); }
  });

  /* public — admitted interns for a cohort year, defaults to current year */
  router.get('/interns', async (req, res, next) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const result = await db.execute({
        sql: 'SELECT id, full_name, Department, bio, photo_url, expectations, cohort_year FROM interns WHERE is_active = 1 AND cohort_year = ? ORDER BY created_at DESC',
        args: [year],
      });
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

export default router; 