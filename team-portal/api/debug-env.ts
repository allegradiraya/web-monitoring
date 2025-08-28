import { pickDbUrl } from "./_db";

export default async function handler(_req: any, res: any) {
  const chosen = pickDbUrl();
  let chosen_env = "POSTGRES_URL_NON_POOLING";
  if (!process.env.POSTGRES_URL_NON_POOLING) {
    chosen_env = process.env.DATABASE_URL ? "DATABASE_URL" : "POSTGRES_URL";
  }

  let host: string | null = null;
  try { host = new URL(chosen).host; } catch {}

  res.status(200).json({
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    has_POSTGRES_URL: !!process.env.POSTGRES_URL,
    chosen_env,
    chosen_host: host
  });
}
