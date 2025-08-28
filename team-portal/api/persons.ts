// team-portal/api/persons.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = getSql();
  try {
    if (req.method === 'GET') {
      const rows = await sql/*sql*/`select id, name, role, unit from persons order by name`;
      res.status(200).json({ ok: true, rows });
      return;
    }

    if (req.method === 'POST') {
      const { persons } = req.body as {
        persons: Array<{ id: string; name: string; role: string; unit: string }>;
      };
      if (!Array.isArray(persons)) {
        res.status(400).json({ ok: false, error: 'invalid_payload' });
        return;
      }

      // upsert by id
      for (const p of persons) {
        await sql/*sql*/`
          insert into persons (id, name, role, unit)
          values (${p.id}, ${p.name}, ${p.role}, ${p.unit})
          on conflict (id) do update set name = excluded.name, role = excluded.role, unit = excluded.unit
        `;
      }
      res.status(200).json({ ok: true, count: persons.length });
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
