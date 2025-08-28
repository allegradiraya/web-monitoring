// team-portal/api/debug-env.ts
import { getSql } from "./_db";
export default async function handler(_req: any, res: any) {
  const chosen =
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ?? "";
  const host = (() => { try { return new URL(chosen).host; } catch { return null; } })();
  res.status(200).json({
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    has_POSTGRES_URL: !!process.env.POSTGRES_URL,
    chosen_host: host
  });
}
