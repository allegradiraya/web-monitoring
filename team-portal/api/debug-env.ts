// team-portal/api/debug-env.ts
export default async function handler(_req: any, res: any) {
  // Jangan bocorkan URL penuh—cukup info boolean & potongan host
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    "";

  const host = (() => {
    try {
      const u = new URL(url);
      return u.host;
    } catch {
      return null;
    }
  })();

  res.status(200).json({
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    has_POSTGRES_URL: !!process.env.POSTGRES_URL,
    detected_host: host
  });
}
