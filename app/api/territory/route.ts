import { NextResponse } from 'next/server'
import { q1 } from '@/lib/db'
import { getTerritoryBy, listPlacements, floorFor } from '@/lib/ranking'
import { PRICING } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const t = await getTerritoryBy('code', code)
  if (!t) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  const rows = await listPlacements(t.id)
  const parent = t.parent_id ? await getTerritoryBy('id', t.parent_id) : null

  // Alt birimi olan ülkelerde "kaçı dolu" göstergesi (bağımsız envanter modeli:
  // alt birim toplamları ülke sıralamasına KARIŞMAZ, yalnız bilgi amaçlı).
  let children: { total: number; filled: number; pooledCents: number } | null = null
  if (t.child_count > 0) {
    const c = await q1<{ filled: string; pooled: string }>(
      `SELECT COUNT(DISTINCT p.territory_id) AS filled,
              COALESCE(SUM(p.total_cents), 0) AS pooled
         FROM placements p
         JOIN territories ct ON ct.id = p.territory_id
        WHERE ct.parent_id = $1 AND p.total_cents > 0`,
      [t.id],
    )
    children = { total: t.child_count, filled: Number(c?.filled ?? 0), pooledCents: Number(c?.pooled ?? 0) }
  }

  // Bir il/eyalet açıkken üst ülkenin durumunu da döneriz: panelde
  // "ülkenin tamamını da al" teklifi bu veriyle kurulur.
  let parentOffer: {
    code: string; name: string; floorCents: number; bidders: number
    leaderKey: string | null; leaderTotalCents: number; requiredToLeadCents: number
  } | null = null
  if (parent) {
    const prows = await listPlacements(parent.id)
    const leaderTotal = prows.length > 0 ? prows[0].total_cents : 0
    const floor = floorFor(parent, false)
    parentOffer = {
      code: parent.code,
      name: parent.name,
      floorCents: floor,
      bidders: prows.length,
      leaderKey: prows[0]?.canonical_key ?? null,
      leaderTotalCents: leaderTotal,
      // Henüz kimse yoksa taban; varsa lideri geçecek tutar.
      requiredToLeadCents: prows.length === 0 ? floor : Math.max(floor, leaderTotal + PRICING.outbidStepCents),
    }
  }

  return NextResponse.json({
    territory: {
      code: t.code, slug: t.slug, name: t.name, kind: t.kind,
      subtype: t.subtype, lon: t.lon, lat: t.lat,
      selectable: !!t.selectable,
      parent: parent ? { code: parent.code, name: parent.name, slug: parent.slug } : null,
      childCount: t.child_count,
    },
    floorCents: floorFor(t, false),
    topUpFloorCents: PRICING.topUpFloorCents,
    children,
    parentOffer,
    placements: rows.map((r, i) => ({
      rank: i + 1,
      key: r.canonical_key,
      displayUrl: r.display_url,
      outboundUrl: r.outbound_url,
      title: r.title,
      iconUrl: r.icon_url,
      color: r.brand_color,
      totalCents: r.total_cents,
      clicks: r.click_count,
    })),
  })
}
