import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// create table if it doesn't exist
await db.execute(`
  CREATE TABLE IF NOT EXISTS interns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Matriculation_Number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    Department TEXT,
    bio TEXT,
    photo_url TEXT,
    skills TEXT,
    expectations TEXT,
    ADDRESS TEXT,
    phone_number TEXT,
    Parent_contact TEXT,
    is_active INTEGER DEFAULT 0,
    cohort_year INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// add cohort_year column for older deployments that don't have it yet
try {
  await db.execute('ALTER TABLE interns ADD COLUMN cohort_year INTEGER');
} catch (err) {
  // column already exists — ignore
  if (!/duplicate column/i.test(err.message)) throw err;
}

// backfill any NULL cohort_year rows to 2026 (one-time)
await db.execute('UPDATE interns SET cohort_year = 2026 WHERE cohort_year IS NULL');

// review status: 'pending' | 'admitted' | 'rejected'
try {
  await db.execute("ALTER TABLE interns ADD COLUMN status TEXT DEFAULT 'pending'");
} catch (err) {
  if (!/duplicate column/i.test(err.message)) throw err;
}

// backfill: sync status from legacy is_active values (one-time for old rows)
await db.execute("UPDATE interns SET status = 'admitted' WHERE status IS NULL AND is_active = 1");
await db.execute("UPDATE interns SET status = 'pending' WHERE status IS NULL");

// attendance log — one row per intern per date
await db.execute(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Matriculation_Number TEXT NOT NULL,
    date TEXT NOT NULL,
    time_in TEXT,
    time_out TEXT,
    hours REAL,
    cohort_year INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(Matriculation_Number, date)
  )
`);

// hub config — single-row table holding the current allowed hub IP
await db.execute(`
  CREATE TABLE IF NOT EXISTS hub_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_ip TEXT,
    updated_at TEXT,
    updated_by TEXT
  )
`);
await db.execute('INSERT OR IGNORE INTO hub_config (id) VALUES (1)');

export default db;
