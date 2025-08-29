// api/achievements.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, ensureTables } from "./_db";

function send(res: VercelResponse, data: any, status = 200) {
  res.status(status).setHeader("cache-control", "no-store").json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!sql) return send(res, { ok: false, error: "DATABASE_URL/POSTGRES_URL is missing" }, 500);

    await ensureTables();

    if (req.method === "GET") {
      const from = (req.query.from as string) || "";
      const to = (req.query.to as string) || "";

      let rows: any[] = [];
      if (from && to) {
        rows = await sql/* sql */`
          SELECT id, person_id, product, amount::float8 AS amount, date
          FROM achievements
          WHERE date >= ${from} AND date < ${to}
          ORDER BY date DESC, id DESC;
        `;
      } else {
        rows = await sql/* sql */`
          SELECT id, person_id, product, amount::float8 AS amount, date
          FROM achievements
          ORDER BY date DESC, id DESC
          LIMIT 500;
        `;
      }
      return send(res, { ok: true, rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const personId = String(body?.personId || "").trim();
      const product = String(body?.product || "").trim();
      const amount = Number(body?.amount);
      const date = String(body?.date || "").slice(0, 10);

      if (!personId || !product || !Number.isFinite(amount) || !date) {
        return send(res, { ok: false, error: "Invalid payload" }, 400);
      }

      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);

      await sql/* sql */`
        INSERT INTO achievements (id, person_id, product, amount, date)
        VALUES (${id}, ${personId}, ${product}, ${amount}, ${date});
      `;

      return send(res, {
        ok: true,
        row: { id, person_id: personId, product, amount, date },
      }, 201);
    }

    if (req.method === "DELETE") {
      const id = (req.query.id as string) || "";
      if (!id) return send(res, { ok: false, error: "id required" }, 400);

      await sql/* sql */`DELETE FROM achievements WHERE id = ${id};`;
      return send(res, { ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return send(res, { ok: false, error: "Method Not Allowed" }, 405);
  } catch (e: any) {
    return send(res, { ok: false, error: e?.message || "Internal error" }, 500);
  }
}
