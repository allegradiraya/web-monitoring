import { getSql } from "./_db";

export default async function handler(req: any, res: any) {
  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = await sql/*sql*/`
        SELECT a.*, p.name AS person_name
        FROM achievements a
        JOIN persons p ON p.id = a.person_id
        ORDER BY a.date DESC, a.created_at DESC
        LIMIT 500;
      `;
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const { id, personId, product, amount, date } = req.body ?? {};
      if (!id || !personId || !product || amount == null || !date)
        return res.status(400).json({ error: "Bad payload" });

      await sql/*sql*/`
        INSERT INTO achievements (id, person_id, product, amount, date)
        VALUES (${id}, ${personId}, ${product}, ${amount}, ${date});
      `;
      return res.status(201).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id || Array.isArray(id))
        return res.status(400).json({ error: "Missing id" });

      await sql`DELETE FROM achievements WHERE id=${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
