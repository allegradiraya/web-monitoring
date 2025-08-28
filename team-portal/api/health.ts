export default async function handler(_req: any, res: any) {
  try {
    // import dinamis supaya jika modul gagal, bisa kita tangkap
    const { getSql, pickDbUrl } = await import("./_db").catch((e) => {
      throw new Error(`db_import_failed: ${e?.message || e}`);
    });

    const sql = getSql(); // jika URL/driver bermasalah, akan ter-throw di sini

    const [row] = await sql`select now() as now, version() as pg_version`;
    const host = (() => { try { return new URL(pickDbUrl()).host; } catch { return null; } })();
    res.status(200).json({ ok: true, host, ...row });
  } catch (e: any) {
    console.error("health error:", e);
    res.status(500).json({
      ok: false,
      error: e?.message ?? String(e),
      name: e?.name,
      code: e?.code,
    });
  }
}
