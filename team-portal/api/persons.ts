// api/persons.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureTables } from "./_db";

function send(res: VercelResponse, data: any, status = 200) {
  res
    .status(status)
    .setHeader("content-type", "application/json; charset=utf-8")
    .setHeader("cache-control", "no-store")
    .send(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!sql) return send(res, { ok: false, error: "DATABASE_URL/POSTGRES_URL is missing" }, 500);

    await ensureTables();

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, { ok: false, error: "Method Not Allowed" }, 405);
    }

    let body: any = req.body;
    if (typeof body !== "object") {
      try { body = JSON.parse(String(req.body || "{}")); }
      catch { return send(res, { ok: false, error: "Invalid JSON body" }, 400); }
    }

    const persons = Array.isArray(body?.persons) ? body.persons : [];
    if (!persons.length) return send(res, { ok: false, error: "No persons" }, 400);

    const values = persons.map((p: any) => [
      String(p.id), String(p.name), String(p.role), String(p.unit),
    ]);

    await sql/* sql */`
      INSERT INTO persons (id, name, role, unit)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          unit = EXCLUDED.unit;
    `;

    return send(res, { ok: true, count: persons.length });
  } catch (e: any) {
    return send(res, { ok: false, error: e?.message || "Internal error" }, 500);
  }
}
