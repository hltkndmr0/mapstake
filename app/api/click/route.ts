import { NextResponse } from 'next/server'
import { q, q1 } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { key?: string; mode?: string; code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body.key) return NextResponse.json({ ok: false }, { status: 400 })

  const adv = await q1<{ id: number }>(
    `SELECT id FROM advertisers WHERE canonical_key = $1`, [body.key],
  )
  if (!adv) return NextResponse.json({ ok: false }, { status: 404 })

  const terr = body.code
    ? await q1<{ id: number }>(`SELECT id FROM territories WHERE code = $1`, [body.code])
    : undefined

  await q(`INSERT INTO clicks (advertiser_id, territory_id) VALUES ($1,$2)`, [adv.id, terr?.id ?? null])
  // Tık sayacı yerleşim bazında tutulur -> hangi bölgenin değer ürettiği ölçülebilir.
  if (terr) {
    await q(
      `UPDATE placements SET click_count = click_count + 1 WHERE advertiser_id = $1 AND territory_id = $2`,
      [adv.id, terr.id],
    )
  }
  return NextResponse.json({ ok: true })
}
