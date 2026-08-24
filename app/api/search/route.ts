import { NextResponse } from 'next/server'
import { q } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Haritanın klavye/ekran okuyucu alternatifi bu uca dayanır.
// 4790 bölgenin tamamı aranabilir; ülke sonuçları önce gelir.
export async function GET(req: Request) {
  const term = (new URL(req.url).searchParams.get('q') || '').trim()
  if (term.length < 1) return NextResponse.json({ results: [] })

  // ILIKE: Postgres'te büyük/küçük harf duyarsız eşleşme (SQLite'ta COLLATE NOCASE idi).
  const rows = await q<{
    code: string; name: string; kind: string; subtype: string | null
    child_count: number; parent_code: string | null; parent_name: string | null
    bidders: string; pool: string
  }>(
    `SELECT t.code, t.name, t.kind, t.subtype, t.child_count,
            p.code AS parent_code, p.name AS parent_name,
            COALESCE(agg.bidders, 0) AS bidders,
            COALESCE(agg.pool, 0)    AS pool
       FROM territories t
       LEFT JOIN territories p ON p.id = t.parent_id
       LEFT JOIN (
         SELECT territory_id, COUNT(*) AS bidders, SUM(total_cents) AS pool
           FROM placements WHERE total_cents > 0 GROUP BY territory_id
       ) agg ON agg.territory_id = t.id
      WHERE t.name ILIKE $1 OR t.code ILIKE $1
      ORDER BY (t.kind = 'country') DESC,
               (t.name ILIKE $2) DESC,
               agg.pool DESC NULLS LAST,
               t.name ASC
      LIMIT 40`,
    [`%${term}%`, `${term}%`],
  )

  return NextResponse.json({
    results: rows.map((r) => ({ ...r, bidders: Number(r.bidders), pool: Number(r.pool) })),
  })
}
