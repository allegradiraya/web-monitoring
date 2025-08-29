// api/_db.ts
import { neon } from "@neondatabase/serverless";

export const CONNECTION =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

if (!CONNECTION) {
  console.warn(
    "[DB] DATABASE_URL / POSTGRES_URL belum diset. API akan error sampai env diisi."
  );
}

// sql client (null kalau env belum ada)
export const sql = CONNECTION ? neon(CONNECTION) : null;

// bikin tabel kalau belum ada
export async function ensureTables() {
  if (!sql) return;

  await sql/* sql */ `
    CREATE TABLE IF NOT EXISTS persons (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      unit TEXT NOT NULL
    );
  `;

  await sql/* sql */ `
    CREATE TABLE IF NOT EXISTS achievements (
      id        TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      product   TEXT NOT NULL,
      amount    NUMERIC NOT NULL,
      date      DATE NOT NULL
    );
  `;
}
