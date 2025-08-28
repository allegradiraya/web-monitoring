import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

export function getSql() {
  // SELALU pilih non-pooling jika ada
  const url =
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;

  if (!url) throw new Error("Missing DATABASE_URL / POSTGRES_URL(_NON_POOLING)");
  return neon(url);
}
