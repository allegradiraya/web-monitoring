export default async function handler(_req: any, res: any) {
  try {
    const mod =
      (await import(/* @vite-ignore */ "./_db.js").catch(() => null)) ??
      (await import("./_db").catch(() => null));
    if (!mod) throw new Error("db_import_failed");
    const { getSql } = mod as { getSql: () => any };
    const sql = getSql();

    const rows = await sql`select id, name, role, unit from persons order by name`;
    res.status(200).json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
