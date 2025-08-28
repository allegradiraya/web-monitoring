import { getSql, pickDbUrl } from "./_db";

export default async function handler(_req: any, res: any) {
  try {
    const sql = getSql();
    const [row] = await sql`select now() as now, version() as pg_version`;
    const host = (() => { try { return new URL(pickDbUrl()).host; } catch { return null; } })();
    res.status(200).json({ ok: true, host, ...row });
  } catch (e: any) {
    // log ke Vercel Functions log
    console.error("health error:", e);
    // balas error minimal agar cepat diagnosa
    res.status(500).json({
      ok: false,
      error: e?.message ?? String(e),
      name: e?.name,
      code: e?.code,
    });
  }
}
