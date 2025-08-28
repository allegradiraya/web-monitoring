type Ach = { id?: string; personId: string; product: string; amount: number; date: string };

async function readJson(req: any) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default async function handler(req: any, res: any) {
  try {
    const mod =
      (await import(/* @vite-ignore */ "./_db.js").catch(() => null)) ??
      (await import("./_db").catch(() => null));
    if (!mod) throw new Error("db_import_failed");
    const { getSql } = mod as { getSql: () => any };
    const sql = getSql();

    if (req.method === "GET") {
      const limit = Math.min(1000, Number(req.query?.limit) || 200);
      const rows = await sql`
        select id, person_id as "personId", product, amount::float as amount, date
        from achievements
        order by date desc, id desc
        limit ${limit}`;
      return res.status(200).json({ ok: true, rows });
    }

    if (req.method === "POST") {
      const b: Ach = await readJson(req);
      if (!b?.personId || !b?.product || b?.amount == null || !b?.date) {
        return res.status(400).json({ ok: false, error: "Missing fields" });
      }
      const id = b.id ?? uid();
      await sql`
        insert into achievements (id, person_id, product, amount, date)
        values (${id}, ${b.personId}, ${b.product}, ${Number(b.amount)||0}, ${b.date})
        on conflict (id) do nothing`;
      return res.status(200).json({ ok: true, id });
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
