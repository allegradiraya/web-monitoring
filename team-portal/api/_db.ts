import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

export function pickDbUrl(): string {
  // SELALU prioritaskan non-pooling
  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    ""
  );
}

export function getSql() {
  const url = pickDbUrl();
  if (!url) throw new Error("Missing DATABASE_URL / POSTGRES_URL(_NON_POOLING)");
  return neon(url);
}
