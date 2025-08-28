type Person = { id: string; name: string; role: string; unit: string };
type Product = { name: string; type: "money" | "unit" };
type Achievement = { id: string; personId: string; product: string; amount: number; date: string };
type Targets = Record<string, Record<string, number>>;
type Allowed = Record<string, Record<string, boolean>>;

async function readJson(req: any) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }
  try {
    const mod =
      (await import(/* @vite-ignore */ "./_db.js").catch(() => null)) ??
      (await import("./_db").catch(() => null));
    if (!mod) throw new Error("db_import_failed");

    const { getSql } = mod as { getSql: () => any };
    const sql = getSql();

    const payload = await readJson(req);
    const persons: Person[] = payload.persons ?? [];
    const products: Product[] = payload.products ?? [];
    const achievements: Achievement[] = payload.achievements ?? [];
    const targets: Targets = payload.targets ?? {};
    const allowed: Allowed = payload.allowed ?? {};

    // Flatten map -> rows
    const targetRows: { person_id: string; product: string; value: number }[] = [];
    for (const [pid, m] of Object.entries(targets)) {
      for (const [prod, val] of Object.entries(m as Record<string, number>)) {
        targetRows.push({ person_id: pid, product: prod, value: Number(val) || 0 });
      }
    }
    const allowedRows: { person_id: string; product: string; allowed: boolean }[] = [];
    for (const [pid, m] of Object.entries(allowed)) {
      for (const [prod, al] of Object.entries(m as Record<string, boolean>)) {
        allowedRows.push({ person_id: pid, product: prod, allowed: !!al });
      }
    }

    // —— Insert/Upsert sekuensial (tanpa transaksi) ——
    let cPersons = 0, cProducts = 0, cAch = 0, cTargets = 0, cAllowed = 0;

    for (const p of persons) {
      await sql`INSERT INTO persons (id,name,role,unit)
                VALUES (${p.id},${p.name},${p.role},${p.unit})
                ON CONFLICT (id) DO NOTHING`;
      cPersons++;
    }

    for (const pr of products) {
      await sql`INSERT INTO products (name,type)
                VALUES (${pr.name},${pr.type})
                ON CONFLICT (name) DO UPDATE SET type=EXCLUDED.type`;
      cProducts++;
    }

    for (const a of achievements) {
      await sql`INSERT INTO achievements (id,person_id,product,amount,date)
                VALUES (${a.id},${a.personId},${a.product},${Number(a.amount) || 0},${a.date})
                ON CONFLICT (id) DO NOTHING`;
      cAch++;
    }

    for (const t of targetRows) {
      await sql`INSERT INTO targets (person_id,product,value)
                VALUES (${t.person_id},${t.product},${t.value})
                ON CONFLICT (person_id,product) DO UPDATE SET value=EXCLUDED.value`;
      cTargets++;
    }

    for (const al of allowedRows) {
      await sql`INSERT INTO allowed (person_id,product,allowed)
                VALUES (${al.person_id},${al.product},${al.allowed})
                ON CONFLICT (person_id,product) DO UPDATE SET allowed=EXCLUDED.allowed`;
      cAllowed++;
    }

    res.status(200).json({
      ok: true,
      counts: { persons: cPersons, products: cProducts, achievements: cAch, targets: cTargets, allowed: cAllowed }
    });
  } catch (e: any) {
    console.error("seed error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
