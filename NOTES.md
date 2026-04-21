# Internship Server — Build Notes & Lessons

Personal reference for the Web3Nova interns registration server.
Built on: Node.js (ESM) · Express · Turso (libSQL) · Cloudinary · Multer · Render

---

## 1. What the server does

Two endpoints:

- **`POST /form`** — protected by `x-api-key`. Internal registration form submits intern details + photo.
- **`GET /interns`** — public. Landing page reads this to display the current cohort.

Photos go to Cloudinary; everything else goes to a Turso SQLite DB hosted remotely.

---

## 2. Mistakes I made and what I learned

### 2.1 Mixing CJS and ESM

**What I did:** had `import` at the top of `app.js` but also `module.exports = app;` at the bottom, plus used `__dirname` (which doesn't exist in ESM).

**Rule:** `"type": "module"` in `package.json` means the whole project is ESM. In ESM:
- Use `import` / `export`, never `require` / `module.exports`
- File extensions are **required** on local imports: `import db from './config/db.js'`, not `./config/db`
- `__dirname` doesn't exist — use `import.meta.url` if you need it
- One `export default` per file

### 2.2 Using `import` like a runtime assignment

**What I did:**
```js
import router from express.Router();   // ❌ syntax error
```

**Rule:** `import` is static module loading — only valid to import a binding from another file. To create a value at runtime, use `const`:
```js
import express from 'express';
const router = express.Router();   // ✅
```

### 2.3 Duplicate `export default`

**What I did:** had two `export default` in the same file.

**Rule:** one default export per file. Named exports (`export function foo() {}`) can be many.

### 2.4 `await` outside an `async` function

**What I did:** `router.get('/x', (req, res) => { await db.execute(...) })` — arrow function wasn't async.

**Rule:** every function using `await` must be declared `async`. The function that contains the `await`, not the enclosing one.

### 2.5 Forgot to import `cors`

**What I did:** used `cors(...)` without `import cors from 'cors'`. Got `ReferenceError: cors is not defined`.

**Rule:** `ReferenceError: X is not defined` = you used `X` without importing or declaring it.

### 2.6 Catch-all blocking all routes

**What I did:**
```js
app.use('/', (req, res) => { res.send('live'); });
app.use('/interns', internsRouter);   // never reached
```

**Rule:** `app.use('/', handler)` is a catch-all that matches everything. Use `app.get('/', ...)` instead for a single route.

### 2.7 CORS mounted after a route

**What I did:** put `app.use(cors(...))` after the `/` route.

**Rule:** middleware runs top-to-bottom. Anything registered **before** a route affects that route; anything **after** doesn't. Register `cors`, `json`, logging, and security middleware **before** your routes.

### 2.8 dotenv ordering

**What I did:** `import 'dotenv/config'` on line 9, after other imports that read `process.env`.

**What went wrong:** ES imports run in dependency order. `db.js` tried to read `process.env.DATABASE_URL` before dotenv loaded. Got `URL_INVALID: The URL 'undefined' is not in a valid format`.

**Rule:** put `import 'dotenv/config';` as the **first line** of `app.js`. Side-effect imports run as soon as the module is parsed.

### 2.9 GET handler doing an INSERT

**What I did:** GET `/interns` had an `INSERT` statement using undefined variables.

**Rule:** verbs matter.
- `GET` = read, idempotent, no side effects
- `POST` = create, has side effects
- Never mutate DB in a GET handler (proxies cache them, browsers retry them).

### 2.10 Returning a string instead of data

**What I did:** `res.send('interns fetched successfully')` on an endpoint meant to return interns.

**Rule:** API endpoints return **data**, not success messages. Use `res.json(result.rows)`.

### 2.11 `SELECT *` risks

**What I did nearly did:** `SELECT * FROM interns` on the public endpoint.

**Rule:** always explicit-allowlist columns on public endpoints:
```sql
SELECT id, full_name, Department, bio, photo_url, expectations FROM interns
```
If someone adds a new column (say `SSN`) later, `SELECT *` silently leaks it. Explicit lists don't.

### 2.12 Double-prefix routing

**What I did:**
```js
// app.js
app.use('/form', usersRouter);
app.use('/interns', usersRouter);

// routes
router.post('/form', ...)       // becomes POST /form/form
router.get('/interns', ...)     // becomes GET /interns/interns
```

**Rule:** `app.use(prefix, router)` **prepends** `prefix` to every route in that router. Either mount at `/` and keep full paths in the router, or mount at `/form` and use `router.post('/', ...)`.

### 2.13 Cloudinary wiring — imported the package instead of my config

**What I did:** `import cloudinary from 'cloudinary'` — imported the raw SDK instead of my `config/cloudinary.js` which actually calls `cloudinary.config({...})`.

**Rule:** when you have a config wrapper, import the wrapper, not the library:
```js
import cloudinary from '../config/cloudinary.js';   // ✅
```

### 2.14 Placeholder comments left in production code

**What I did:** left `/* ...etc */` and literal `...` in SQL strings when I pasted a template.

**Lesson:** always finish the templates. libSQL error "Unsupported type of value" = an arg is `undefined` (usually because destructuring missed a field).

### 2.15 Render using yarn instead of npm

**What happened:** Render's default build command was `yarn`, but my repo had `package-lock.json` (npm). Yarn saved its own `yarn.lock` → two lockfiles drifting apart.

**Fix:** Render dashboard → Settings → Build Command → `npm install`.

---

## 3. Architecture — how it all fits

```
Client (Postman / Frontend)
    │
    ▼
┌─────────────────────────────────┐
│  app.js (Express app)           │
│    ├── dotenv/config (line 1)   │
│    ├── trust proxy (Render)     │
│    ├── logger                   │
│    ├── json / urlencoded        │
│    ├── cookieParser             │
│    ├── cors (web3nova.com only) │
│    ├── rate limiters            │
│    ├── GET /  health            │
│    ├── routes (intern.js)       │
│    ├── 404 handler              │
│    └── error handler (JSON)     │
└─────────────────────────────────┘
    │
    ├──► POST /form   apiKey → multer → Cloudinary → Turso INSERT
    └──► GET /interns rate-limit → Turso SELECT → JSON
```

### 3.1 Middleware order in `app.js`

Order I landed on, and why:

1. `dotenv/config` — must load env vars before any code reads `process.env`
2. `trust proxy` — Render puts a load balancer in front; without this, rate-limit sees one IP for everyone
3. `logger('dev')` — log every request
4. `express.json()` + `express.urlencoded()` — parse JSON / form bodies
5. `cors()` — set CORS headers before routes
6. Rate limiters — stop abuse before hitting handlers
7. Routes
8. 404 handler — only reached if no route matched
9. Error handler — catches anything thrown, returns JSON

### 3.2 The photo upload flow

```
client POSTs multipart/form-data
        │
        ▼
apiKey middleware (timing-safe compare)
        │
        ▼
multer.single('photo')
   → parses file into req.file.buffer (memory, not disk)
   → validates mime + size
        │
        ▼
route handler:
   uploadBuffer(req.file.buffer)
     → cloudinary.uploader.upload_stream(...).end(buffer)
     → resolves to secure_url
        │
        ▼
db.execute(INSERT ... photo_url, ...)
        │
        ▼
res.json({ message: 'form submitted' })
```

**Why memoryStorage and not diskStorage?** Render filesystem is ephemeral and we don't want files on the server — Cloudinary hosts them. Memory buffer is the simplest pipe.

### 3.3 Why Turso (libSQL) instead of MySQL

- Free tier with remote SQLite semantics
- No local install needed; works from any env with auth token
- `@libsql/client` uses parameterized queries (`args: [...]`) which are SQL-injection-safe
- Good enough for a cohort listing — not a high-write workload

---

## 4. Security measures I added (post-audit)

### 4.1 Rate limiting
```js
import rateLimit from 'express-rate-limit';
app.set('trust proxy', 1);

const formLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const internsLimiter = rateLimit({ windowMs: 60_000, max: 60 });

app.use('/form', formLimiter);
app.use('/interns', internsLimiter);
```

**Why:** stops API-key brute-forcing on POST and DB quota exhaustion on GET.

### 4.2 Timing-safe API key compare
```js
import crypto from 'crypto';
const a = Buffer.from(provided);
const b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 401;
```

**Why:** `===` returns on the first mismatched byte — in theory, attackers can measure response times to brute-force the key. `timingSafeEqual` always takes the same time regardless of match position.

### 4.3 Multer file limits
```js
multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg','image/png','image/webp'].includes(file.mimetype)) {
      return cb(new Error('only jpeg/png/webp allowed'));
    }
    cb(null, true);
  },
});
```

**Why:** stops DoS via huge uploads and stops random file types (e.g. executables) from being accepted.

### 4.4 Public endpoint only returns safe columns
Excluded from `GET /interns`: `email`, `phone_number`, `Matriculation_Number`, `ADDRESS`, `Parent_contact`. Even though those sit in the DB, they never leave the server.

### 4.5 `NODE_ENV=production` on Render
Stops error stack traces from appearing in response bodies (dev-only debug info).

### 4.6 404 noise suppression
```js
if (err.status !== 404) console.error(err);
```
Stops `/favicon.ico` from spamming logs with stack traces.

---

## 5. Deployment (Render)

- **Build command:** `npm install`
- **Start command:** `npm run start`
- **Node version:** 22.x (Render default)
- **Env vars (set in Render dashboard, NOT in repo):**
  - `DATABASE_URL` — Turso URL (`libsql://...`)
  - `DATABASE_AUTH_TOKEN` — Turso token
  - `API_KEY` — your chosen server key
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `NODE_ENV=production`

### Cold start problem (free tier)
Render free instances sleep after 15 min idle → first request after sleep takes 30-60s to wake.

**Fix:** UptimeRobot pinger every 5 min on `GET /` keeps the service warm. Free.

---

## 6. Testing checklist

Run these in Postman against the deployed URL before handoff:

- [ ] `GET /` returns `intership server is live`
- [ ] `POST /form` with valid `x-api-key` + form-data returns 200
- [ ] `POST /form` without `x-api-key` returns 401
- [ ] `POST /form` with wrong `x-api-key` returns 401 (same message — don't reveal why)
- [ ] `GET /interns` returns JSON array, no API key required
- [ ] `POST /form` with 10MB image returns error (file too large)
- [ ] `POST /form` with a PDF as `photo` returns error (wrong mime)
- [ ] Hit `POST /form` 11 times in 60s → 11th returns 429

---

## 7. Things I would improve next time

1. **Validation library** — add `zod` or `joi` to validate `req.body` shape up front instead of hoping fields exist.
2. **Structured logging** — `logger('dev')` is fine locally but pick something like `pino` for production so Render logs are parseable.
3. **Soft-delete endpoint** — currently `is_active` is set to 1 at creation, but there's no way to deactivate an intern. Add `PATCH /intern/:id/deactivate`.
4. **Handbook / docs scraper** — if Web3Nova wants intern bio/skills auto-enriched from their socials, add a cron that fills in missing fields.
5. **Unit tests** — Jest + supertest for the two routes. ~20 lines each, huge safety net.

---

## 8. Final file structure

```
intership-server/
├── app.js                 # Express app setup, middleware chain, server start
├── config/
│   ├── db.js              # Turso client + CREATE TABLE on boot
│   └── cloudinary.js      # Cloudinary SDK config
├── middleware/
│   └── apiKey.js          # timing-safe x-api-key guard
├── routes/
│   └── intern.js          # POST /form + GET /interns
├── .env                   # NOT committed — env secrets
├── package.json
├── package-lock.json
├── API.md                 # handoff doc for frontend dev
└── NOTES.md               # this file
```

---

Built during first week of internship at Web3Nova, as Technical Lead.
