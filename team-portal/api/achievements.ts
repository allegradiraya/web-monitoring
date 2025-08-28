// team-portal/api/achievements.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = getSql();

  try {
    if (req.method === 'GET') {
      // Optional range filter (?from=YYYY-MM-DD&to=YYYY-MM-DD)
      const { from, to } = req.query as { from?: string; to?: string };
      const rows =
        from && to
          ? await sql/*sql*/`
              select id, person_id, product, amount, date
              from achievements
              where date >= ${from} and date < ${to}
              order by date desc, id desc
            `
          : await sql/*sql*/`
              select id, person_id, product, amount, date
              from achievements
              order by date desc, id desc
            `;

      res.status(200).json({ ok: true, rows });
      return;
    }

    if (req.method === 'POST') {
      const { personId, product, amount, date } = req.body || {};
      if (!personId || !product || amount == null || !date) {
        res.status(400).json({ ok: false, error: 'missing_fields' });
        return;
      }

      const [row] = await sql/*sql*/`
        insert into achievements (person_id, product, amount, date)
        values (${personId}, ${product}, ${Number(amount)}, ${date})
        returning id, person_id, product, amount, date
      `;
      res.status(201).json({ ok: true, row });
      return;
    }

    if (req.method === 'DELETE') {
      const id = (req.query?.id as string) || (req.body?.id as string);
      if (!id) {
        res.status(400).json({ ok: false, error: 'missing_id' });
        return;
      }
      await sql/*sql*/`delete from achievements where id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
