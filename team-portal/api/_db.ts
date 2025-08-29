// api/_db.ts
import { neon } from "@neondatabase/serverless";

export const CONNECTION =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  "";

export const sql = CONNECTION ? neon(CONNECTION) : null;

export async function ensureTables() {
  if (!sql) return;

  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS persons (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      unit TEXT NOT NULL
    );
  `;

  await sql/* sql */`
    CREATE TABLE IF NOT EXISTS achievements (
      id        TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      product   TEXT NOT NULL,
      amount    NUMERIC NOT NULL,
      date      DATE NOT NULL
    );
  `;
}
