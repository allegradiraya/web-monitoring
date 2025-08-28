import { getSql } from "./_db";

export default async function handler(_req: any, res: any) {
  try {
    const sql = getSql();
    const rows = await sql`select now() as now, version() as pg_version`;
    res.status(200).json({ ok: true, ...rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
