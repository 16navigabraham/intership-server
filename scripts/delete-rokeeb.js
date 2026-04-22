/**
 * One-off cleanup: remove any intern whose name or email contains "rokeeb"
 * along with their attendance records.
 *
 * Usage:
 *   node scripts/delete-rokeeb.js           # dry run — shows matches, no delete
 *   node scripts/delete-rokeeb.js --confirm # actually deletes
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const confirmed = process.argv.includes('--confirm');
const needle = '%rokeeb%';

async function main() {
  const { rows: matches } = await db.execute({
    sql: `SELECT id, Matriculation_Number, full_name, email, status
          FROM interns
          WHERE lower(full_name) LIKE ? OR lower(email) LIKE ?`,
    args: [needle, needle],
  });

  if (matches.length === 0) {
    console.log('No matches found for "rokeeb". Nothing to delete.');
    process.exit(0);
  }

  console.log(`Found ${matches.length} intern(s) matching "rokeeb":\n`);
  for (const m of matches) {
    console.log(`  id=${m.id}  matric=${m.Matriculation_Number || '(none)'}  name=${m.full_name}  email=${m.email}  status=${m.status}`);
  }
  console.log();

  if (!confirmed) {
    console.log('Dry run — nothing was deleted.');
    console.log('Re-run with --confirm to actually delete:');
    console.log('  node scripts/delete-rokeeb.js --confirm');
    process.exit(0);
  }

  let totalAttendance = 0;
  for (const m of matches) {
    if (m.Matriculation_Number) {
      const result = await db.execute({
        sql: 'DELETE FROM attendance WHERE Matriculation_Number = ?',
        args: [m.Matriculation_Number],
      });
      totalAttendance += result.rowsAffected;
    }
    await db.execute({
      sql: 'DELETE FROM interns WHERE id = ?',
      args: [m.id],
    });
    console.log(`Deleted id=${m.id} (${m.full_name})`);
  }

  console.log(`\nDone. Removed ${matches.length} intern(s) and ${totalAttendance} attendance record(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
