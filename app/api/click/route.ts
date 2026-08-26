import { NextResponse } from 'next/server'
import { q, q1 } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { key?: string; mode?: string; code?: string; category?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body.key) return NextResponse.json({ ok: false }, { status: 400 })

  const adv = await q1<{ id: number }>(
    `SELECT id FROM advertisers WHERE canonical_key = $1`, [body.key],
  )
  if (!adv) return NextResponse.json({ ok: false }, { status: 404 })

  const terr = body.code
    ? await q1<{ id: number }>(`SELECT id FROM territories WHERE code = $1`, [body.code])
    : undefined

  // Kategori de yazılır: aynı marka aynı bölgede iki kategoride yer
  // alabildiği için "hangi yarıştan tıklandı" ayrı bir bilgi.
  const category = body.category ?? null
  await q(
    `INSERT INTO clicks (advertiser_id, territory_id, category) VALUES ($1,$2,$3)`,
    [adv.id, terr?.id ?? null, category],
  )
  // Tık sayacı yerleşim bazında tutulur -> hangi bölgenin değer ürettiği ölçülebilir.
  // Kategori verilmezse sayaç YAZILMAZ: kategorisiz bir UPDATE markanın o
  // bölgedeki bütün kategorilerinin sayacını birden şişirirdi.
  if (terr && category) {
    await q(
      `UPDATE placements SET click_count = click_count + 1
        WHERE advertiser_id = $1 AND territory_id = $2 AND category = $3`,
      [adv.id, terr.id, category],
    )
  }
  return NextResponse.json({ ok: true })
}
