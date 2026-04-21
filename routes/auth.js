import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'too many login attempts, try again in a minute' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    const secret = process.env.JWT_SECRET;

    if (!adminEmail || !adminHash || !secret) {
      return res.status(500).json({ error: 'auth not configured' });
    }

    if (email.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(password, adminHash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign({ email: adminEmail, role: 'admin' }, secret, { expiresIn: '12h' });
    res.json({ token, email: adminEmail, expiresIn: 12 * 60 * 60 });
  } catch (err) {
    next(err);
  }
});

export default router;
