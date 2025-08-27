import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM products ORDER BY name;`;
      return res.status(200).json(rows);
    }
    if (req.method === "POST") {
      const { name, type } = req.body ?? {};
      if (!name || !type) return res.status(400).json({ error: "Bad payload" });
      await sql`INSERT INTO products (name,type)
                VALUES (${name},${type})
                ON CONFLICT (name) DO NOTHING;`;
      return res.status(201).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const { name } = req.query;
      if (!name || Array.isArray(name)) return res.status(400).json({ error: "Missing name" });
      await sql`DELETE FROM products WHERE name=${name};`;
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET,POST,DELETE");
    res.status(405).end("Method Not Allowed");
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
