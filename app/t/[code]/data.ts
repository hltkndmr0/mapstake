import { getTerritoryBy, listPlacements, floorFor } from '@/lib/ranking'
import { listCategories } from '@/lib/categories'
import { categoryStandings } from '@/lib/rankings'

/**
 * Paylaşım sayfası ve OG görselinin ortak veri kaynağı.
 *
 * İkisi ayrı istek olarak çalışır (crawler görseli ayrıca çeker), bu yüzden
 * sorgu tek yerde durur — sayfa ile görselin farklı sıralama göstermesi
 * paylaşımı doğrudan yalan hâline getirirdi.
 *
 * Kategori NEDEN query değil de yol parçası (/t/TUR/software):
 * `opengraph-image` yalnız route parametrelerini görür, arama parametrelerini
 * GÖRMEZ. Kategori ?cat= ile taşınsaydı sayfa "Türkiye'nin yazılım #1'i"
 * derken paylaşım kartı bütün kategorilerin birleşik lideriyle çıkardı.
 */
export type ShareEntry = {
  rank: number
  displayUrl: string
  title: string | null
  color: string | null
  totalCents: number
}

export type ShareCategory = {
  slug: string
  name: string
  icon: string
  color: string
}

export type ShareCategoryRow = ShareCategory & {
  bidders: number
  totalCents: number
  leaderUrl: string | null
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
  /** null = bütün kategoriler birlikte. */
  category: ShareCategory | null
  /** Bölgedeki bütün kategoriler — sayfadaki geçiş bağlantıları için. */
  categories: ShareCategoryRow[]
  entries: ShareEntry[]
}

export async function shareView(
  rawCode: string,
  category: string | null = null,
): Promise<ShareView | null> {
  const code = decodeURIComponent(rawCode).toUpperCase()
  const t = await getTerritoryBy('code', code)
  if (!t) return null

  const [rows, all, standings] = await Promise.all([
    listPlacements(t.id, category),
    listCategories(),
    categoryStandings({ kind: 'territory', id: t.id }),
  ])
  const parent = t.parent_id !== null ? await getTerritoryBy('id', t.parent_id) : undefined
  const active = category ? all.find((c) => c.slug === category) ?? null : null

  return {
    code: t.code,
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    parentName: parent?.name ?? null,
    floorCents: floorFor(t, false),
    totalCents: rows.reduce((sum, r) => sum + r.total_cents, 0),
    bidders: rows.length,
    category: active
      ? { slug: active.slug, name: active.name, icon: active.icon, color: active.color }
      : null,
    categories: standings.map((c) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      color: c.color,
      bidders: c.bidders,
      totalCents: c.totalCents,
      leaderUrl: c.leader?.displayUrl ?? null,
    })),
    entries: rows.slice(0, 5).map((r, i) => ({
      rank: i + 1,
      displayUrl: r.display_url,
      title: r.title,
      color: r.brand_color,
      totalCents: r.total_cents,
    })),
  }
}

/** Paylaşım adresi — kategori varsa yol parçası olarak. */
export function sharePath(code: string, category?: string | null): string {
  const base = `/t/${encodeURIComponent(code)}`
  return category ? `${base}/${encodeURIComponent(category)}` : base
}

/** Bölge + kategori için okunur bağlam: "Software & Tech in Turkey". */
export function shareScope(view: ShareView): string {
  const where = view.parentName ? `${view.name}, ${view.parentName}` : view.name
  return view.category ? `${view.category.name} in ${where}` : where
}
