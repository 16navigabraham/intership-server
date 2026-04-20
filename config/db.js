 import { createClient } from '@libsql/client';

  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  // run this once on startup to create the table if it doesn't exist
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
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  export default db;