import { neon, neonConfig } from "@neondatabase/serverless";

neonConfig.fetchConnectionCache = true;

// Pakai env yang tersedia di Vercel:
// - DATABASE_URL (kalau kamu berhasil menambahkannya), atau
// - POSTGRES_URL_NON_POOLING (dari Neon, non-pooler), atau
// - POSTGRES_URL (fallback, pooler)
const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!url) {
  throw new Error("Missing DATABASE_URL/POSTGRES_URL env");
}

export const sql = neon(url);
