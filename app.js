import 'dotenv/config';
import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import usersRouter from './routes/intern.js';
import attendanceRouter from './routes/attendance.js';
import authRouter from './routes/auth.js';
import hubRouter from './routes/hub.js';
import passkeyRouter from './routes/passkey.js';

const app = express();
const port = process.env.PORT || 3010;

app.set('trust proxy', 3); // Render is behind a proxy — trust X-Forwarded-For

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://web3nova.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow no-origin (curl/Postman) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));


app.get('/', (req, res) => {
  res.send('intership server is live');
});

// debug: echo back the caller's IP as seen by the server
app.get('/whoami', (req, res) => {
  res.json({ ip: req.ip, headers_xff: req.headers['x-forwarded-for'] });
});


const formLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'too many submissions, slow down' } });
const internsLimiter = rateLimit({ windowMs: 60_000, max: 60, message: { error: 'too many requests' } });
const attendanceLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'too many requests' } });

app.use('/form', formLimiter);
app.use('/interns', internsLimiter);
app.use('/attendance', attendanceLimiter, attendanceRouter);
app.use('/auth', authRouter);
app.use('/hub', hubRouter);
app.use('/passkey', passkeyRouter);

app.use('/', usersRouter);



// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
  app.use((err, req, res, next) => {
    if (err.status !== 404) console.error(err);
    res.status(err.status || 500).json({
      error: err.message,
      ...(req.app.get('env') === 'development' && { stack: err.stack }),
    });
  });


// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});


export default app;
