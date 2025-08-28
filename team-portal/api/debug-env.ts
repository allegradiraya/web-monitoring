export default async function handler(_req: any, res: any) {
  // Tunjukkan env mana yang ada
  const has_DATABASE_URL = !!process.env.DATABASE_URL;
  const has_POSTGRES_URL_NON_POOLING = !!process.env.POSTGRES_URL_NON_POOLING;
  const has_POSTGRES_URL = !!process.env.POSTGRES_URL;

  // Hitung host dari URL yang DIPILIH (prioritas non-pooling)
  const chosen =
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "";

  let chosen_env = "POSTGRES_URL_NON_POOLING";
  if (!process.env.POSTGRES_URL_NON_POOLING) {
    chosen_env = process.env.DATABASE_URL ? "DATABASE_URL" : "POSTGRES_URL";
  }

  let chosen_host: string | null = null;
  try { chosen_host = new URL(chosen).host; } catch {}

  res.status(200).json({
    has_DATABASE_URL,
    has_POSTGRES_URL_NON_POOLING,
    has_POSTGRES_URL,
    chosen_env,
    chosen_host
  });
}
