export default async function handler(_req: any, res: any) {
  try {
    const mod =
      (await import(/* @vite-ignore */ "./_db.js").catch(() => null)) ??
      (await import("./_db").catch(() => null));
    if (!mod) throw new Error("db_import_failed");

    const { getSql } = mod as { getSql: () => any };
    const sql = getSql();

    await sql`CREATE TABLE IF NOT EXISTS persons(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      unit TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`;

    await sql`CREATE TABLE IF NOT EXISTS products(
      name TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('money','unit'))
    );`;

    await sql`CREATE TABLE IF NOT EXISTS achievements(
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      product TEXT NOT NULL REFERENCES products(name) ON DELETE CASCADE,
      amount NUMERIC NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`;

    await sql`CREATE TABLE IF NOT EXISTS targets(
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      product TEXT NOT NULL REFERENCES products(name) ON DELETE CASCADE,
      value NUMERIC NOT NULL DEFAULT 0,
      PRIMARY KEY(person_id, product)
    );`;

    await sql`CREATE TABLE IF NOT EXISTS allowed(
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      product TEXT NOT NULL REFERENCES products(name) ON DELETE CASCADE,
      allowed BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY(person_id, product)
    );`;

    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("setup error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
