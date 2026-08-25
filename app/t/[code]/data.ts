import { getTerritoryBy, listPlacements, floorFor } from '@/lib/ranking'

/**
 * Paylaşım sayfası ve OG görselinin ortak veri kaynağı.
 *
 * İkisi ayrı istek olarak çalışır (crawler görseli ayrıca çeker), bu yüzden
 * sorgu tek yerde durur — sayfa ile görselin farklı sıralama göstermesi
 * paylaşımı doğrudan yalan hâline getirirdi.
 */
export type ShareEntry = {
  rank: number
  displayUrl: string
  title: string | null
  color: string | null
  totalCents: number
}

export type ShareView = {
  code: string
  slug: string
  name: string
  kind: 'country' | 'admin1'
  parentName: string | null
  floorCents: number
  totalCents: number
  bidders: number
  entries: ShareEntry[]
}

export async function shareView(rawCode: string): Promise<ShareView | null> {
  const code = decodeURIComponent(rawCode).toUpperCase()
  const t = await getTerritoryBy('code', code)
  if (!t) return null

  const rows = await listPlacements(t.id)
  const parent = t.parent_id !== null ? await getTerritoryBy('id', t.parent_id) : undefined

  return {
    code: t.code,
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    parentName: parent?.name ?? null,
    floorCents: floorFor(t, false),
    totalCents: rows.reduce((sum, r) => sum + r.total_cents, 0),
    bidders: rows.length,
    entries: rows.slice(0, 5).map((r, i) => ({
      rank: i + 1,
      displayUrl: r.display_url,
      title: r.title,
      color: r.brand_color,
      totalCents: r.total_cents,
    })),
  }
}
