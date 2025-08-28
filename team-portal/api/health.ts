import { getSql } from "./_db";

export default async function handler(_req: any, res: any) {
  try {
    const sql = getSql();
    const [row] = await sql`select now() as now, version() as pg_version`;
    res.status(200).json({ ok: true, ...row });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
