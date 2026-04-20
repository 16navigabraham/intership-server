import  express from 'express';
import { apiKey } from '../middleware/apiKey.js';
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

  router.post('/form', apiKey, upload.single('photo'), async (req, res, next) => {
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

      await db.execute({
        sql: `INSERT INTO interns
          (Matriculation_Number, full_name, email, Department, bio, photo_url, skills, expectations, ADDRESS, phone_number, Parent_contact)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ],
      });
      res.json({ message: 'form submitted' });
    } catch (err) { next(err); }
  });

  /*fetch current year interns*/
  router.get('/interns', async (req, res, next) => {
    try {
      const result = await db.execute(
        'SELECT id, full_name, Department, bio, photo_url, expectations FROM interns WHERE is_active = 1 ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

export default router; 