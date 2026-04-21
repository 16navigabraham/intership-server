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

export default db;
