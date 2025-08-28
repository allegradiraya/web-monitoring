// team-portal/api/health.ts
export default async function handler(_req: any, res: any) {
  try {
    // ESM: coba import dengan ekstensi .js (build output), lalu fallback ke .ts/no-ext untuk dev
    const mod =
      (await import(/* @vite-ignore */ "./_db.js").catch(() => null)) ??
      (await import("./_db").catch(() => null));

    if (!mod) {
      throw new Error("db_import_failed: compiled module not found");
    }

    const { getSql, pickDbUrl } = mod as {
      getSql: () => any;
      pickDbUrl: () => string;
    };

    const sql = getSql();
    const [row] = await sql`select now() as now, version() as pg_version`;
    const host = (() => {
      try {
        return new URL(pickDbUrl()).host;
      } catch {
        return null;
      }
    })();

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
