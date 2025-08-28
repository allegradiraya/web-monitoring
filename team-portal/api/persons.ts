import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getSql(); 
    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM persons ORDER BY created_at DESC;`;
      return res.status(200).json(rows);
    }
    if (req.method === "POST") {
      const { id, name, role, unit } = req.body ?? {};
      if (!id || !name || !role || !unit) return res.status(400).json({ error: "Bad payload" });
      await sql`INSERT INTO persons (id,name,role,unit)
                VALUES (${id},${name},${role},${unit})
                ON CONFLICT (id) DO NOTHING;`;
      return res.status(201).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id || Array.isArray(id)) return res.status(400).json({ error: "Missing id" });
      await sql`DELETE FROM persons WHERE id=${id};`;
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET,POST,DELETE");
    res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
