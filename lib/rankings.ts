import { q } from './db'

/**
 * Liste görünümünün okuma katmanı.
 *
 * Harita "hangi bölgede kim lider" sorusunu cevaplıyor; liste bunun ters
 * sorusunu soruyor: "bu kapsamda, bu kategoride sıralama nedir?" — dünyadan
 * ülkeye, ülkeden ile doğru daralan üç seviye.
 *
 * Sıralama kuralı harita ile AYNI kalmalı; yoksa aynı veriyi iki yüzey iki
 * türlü gösterir. Tekil yerleşimde kural değişmiyor. Toplulaştırılmış
 * (bir markanın kapsamdaki tüm bölgelerinin toplamı) sıralamada beraberlik,
 * o toplama en erken ulaşan lehine çözülür — tekil kuralın karşılığı.
 */

export type Scope =
  | { kind: 'world' }
  /** Ülke ve altındaki bütün il/eyaletler. */
  | { kind: 'country'; id: number }
  /** Tek bir bölge (il/eyalet ya da yalnız ülkenin kendi slotu). */
  | { kind: 'territory'; id: number }

/**
 * Kapsam filtresini SQL parçası + parametre olarak üretir.
 * `t2` bu sorgularda placements'ın bağlandığı territories takma adıdır.
 */
function scopeClause(scope: Scope, nextParam: number): { sql: string; params: unknown[] } {
  if (scope.kind === 'world') return { sql: 'TRUE', params: [] }
  if (scope.kind === 'country') {
    return { sql: `(t2.id = $${nextParam} OR t2.parent_id = $${nextParam})`, params: [scope.id] }
  }
  return { sql: `t2.id = $${nextParam}`, params: [scope.id] }
}

export type RankedAdvertiser = {
  rank: number
  key: string
  displayUrl: string
  outboundUrl: string
  iconUrl: string | null
  color: string | null
  totalCents: number
  clicks: number
  territories: number
  /** En çok harcadığı kategori — satırdaki rozet. */
  topCategory: string
  /** #1 olduğu bölge sayısı; listede "3 bölgede lider" rozeti. */
  leadCount: number
}

/**
 * Bir kapsamdaki reklamveren sıralaması.
 *
 * Toplam = markanın kapsamdaki BÜTÜN bölgelerdeki yerleşimlerinin toplamı.
 * Dünya seviyesinde "dünya sıralaması" tam olarak budur: tek bir ülkedeki
 * yerleşim değil, küresel harcama.
 */
export async function advertiserRanking(
  scope: Scope,
  category: string | null,
  limit = 100,
  offset = 0,
): Promise<RankedAdvertiser[]> {
  const { sql: scopeSql, params: scopeParams } = scopeClause(scope, 1)
  const catParam = `$${1 + scopeParams.length}`
  const limitParam = `$${2 + scopeParams.length}`
  const offsetParam = `$${3 + scopeParams.length}`

  const rows = await q<{
    key: string; display_url: string; outbound_url: string
    icon_url: string | null; brand_color: string | null
    total: string; clicks: string; territories: string
    top_category: string; lead_count: string
  }>(
    `WITH scoped AS (
       SELECT p.*
         FROM placements p
         JOIN territories t2 ON t2.id = p.territory_id
         JOIN advertisers a  ON a.id = p.advertiser_id
        WHERE a.moderation_status = 'approved' AND p.total_cents > 0
          AND (${catParam}::text IS NULL OR p.category = ${catParam})
          AND ${scopeSql}
     ),
     -- Bölge+kategori başına lider: "kaç slotta #1" rozeti buradan çıkar.
     leaders AS (
       SELECT DISTINCT ON (territory_id, category) territory_id, category, advertiser_id
         FROM scoped
        ORDER BY territory_id, category, total_cents DESC, reached_current_total_at ASC, id ASC
     )
     SELECT a.canonical_key AS key, a.display_url, a.outbound_url,
            a.icon_url, a.brand_color,
            SUM(s.total_cents)               AS total,
            SUM(s.click_count)               AS clicks,
            COUNT(DISTINCT s.territory_id)   AS territories,
            (array_agg(s.category ORDER BY s.total_cents DESC))[1] AS top_category,
            COUNT(l.advertiser_id)           AS lead_count,
            MIN(s.reached_current_total_at)  AS first_reached
       FROM scoped s
       JOIN advertisers a ON a.id = s.advertiser_id
       LEFT JOIN leaders l
              ON l.territory_id = s.territory_id
             AND l.category     = s.category
             AND l.advertiser_id = s.advertiser_id
      GROUP BY a.id, a.canonical_key, a.display_url, a.outbound_url, a.icon_url, a.brand_color
      ORDER BY total DESC, first_reached ASC, a.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...scopeParams, category, limit, offset],
  )

  // Sıra numarası sayfa içinde değil LİSTE genelinde: 2. sayfanın ilk satırı
  // #21'dir, #1 değil.
  return rows.map((r, i) => ({
    rank: offset + i + 1,
    key: r.key,
    displayUrl: r.display_url,
    outboundUrl: r.outbound_url,
    iconUrl: r.icon_url,
    color: r.brand_color,
    totalCents: Number(r.total),
    clicks: Number(r.clicks),
    territories: Number(r.territories),
    topCategory: r.top_category,
    leadCount: Number(r.lead_count),
  }))
}

export type TerritoryRow = {
  code: string
  slug: string
  name: string
  kind: 'country' | 'admin1'
  iso2: string | null
  subtype: string | null
  childCount: number
  basePriceCents: number
  bidders: number
  totalCents: number
  leader: { key: string; displayUrl: string; color: string | null; category: string } | null
  /** Alt birimlerin toplamı — ülke satırında "iller toplamı" olarak görünür. */
  childPoolCents: number
  childFilled: number
}

/**
 * Bir seviyedeki BÜTÜN bölgeler — boşlar dahil.
 *
 * Haritadaki boardLevel yalnız dolu bölgeleri döner (boşlar zaten haritada
 * boş çizilir). Listede ise boş bölgeyi göstermek ürünün kendisi: satılık
 * envanterin listesi budur.
 */
export async function territoryList(
  parentId: number | null,
  category: string | null,
): Promise<TerritoryRow[]> {
  const parentSql = parentId === null ? 't.parent_id IS NULL' : 't.parent_id = $2'
  const params: unknown[] = parentId === null ? [category] : [category, parentId]

  const rows = await q<{
    code: string; slug: string; name: string; kind: 'country' | 'admin1'
    iso2: string | null; subtype: string | null; child_count: number; base_price_cents: number
    bidders: string; pool: string
    leader_key: string | null; leader_url: string | null
    leader_color: string | null; leader_category: string | null
    child_pool: string; child_filled: string
  }>(
    `SELECT t.code, t.slug, t.name, t.kind, t.iso2, t.subtype,
            t.child_count, t.base_price_cents,
            COALESCE(agg.bidders, 0) AS bidders,
            COALESCE(agg.pool, 0)    AS pool,
            lead.canonical_key AS leader_key,
            lead.display_url   AS leader_url,
            lead.brand_color   AS leader_color,
            lead.category      AS leader_category,
            COALESCE(kids.pool, 0)   AS child_pool,
            COALESCE(kids.filled, 0) AS child_filled
       FROM territories t
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS bidders, SUM(p.total_cents) AS pool
           FROM placements p
           JOIN advertisers a ON a.id = p.advertiser_id
          WHERE p.territory_id = t.id AND p.total_cents > 0
            AND a.moderation_status = 'approved'
            AND ($1::text IS NULL OR p.category = $1)
       ) agg ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.canonical_key, a.display_url, a.brand_color, p.category
           FROM placements p
           JOIN advertisers a ON a.id = p.advertiser_id
          WHERE p.territory_id = t.id AND p.total_cents > 0
            AND a.moderation_status = 'approved'
            AND ($1::text IS NULL OR p.category = $1)
          ORDER BY p.total_cents DESC, p.reached_current_total_at ASC, p.id ASC
          LIMIT 1
       ) lead ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(p.total_cents) AS pool, COUNT(DISTINCT p.territory_id) AS filled
           FROM placements p
           JOIN territories ct ON ct.id = p.territory_id
           JOIN advertisers a  ON a.id = p.advertiser_id
          WHERE ct.parent_id = t.id AND p.total_cents > 0
            AND a.moderation_status = 'approved'
            AND ($1::text IS NULL OR p.category = $1)
       ) kids ON TRUE
      WHERE ${parentSql}
      ORDER BY (COALESCE(agg.pool, 0) + COALESCE(kids.pool, 0)) DESC, t.name ASC`,
    params,
  )

  return rows.map((r) => ({
    code: r.code,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    iso2: r.iso2,
    subtype: r.subtype,
    childCount: Number(r.child_count),
    basePriceCents: Number(r.base_price_cents),
    bidders: Number(r.bidders),
    totalCents: Number(r.pool),
    leader: r.leader_key
      ? {
          key: r.leader_key,
          displayUrl: r.leader_url ?? r.leader_key,
          color: r.leader_color,
          category: r.leader_category ?? 'other',
        }
      : null,
    childPoolCents: Number(r.child_pool),
    childFilled: Number(r.child_filled),
  }))
}

export type CategoryStanding = {
  slug: string
  name: string
  icon: string
  color: string
  bidders: number
  totalCents: number
  leader: { key: string; displayUrl: string; iconUrl: string | null; totalCents: number } | null
}

/**
 * Kapsamdaki her kategorinin durumu — boş kategoriler dahil.
 *
 * Boşları göstermek şart: "bu ülkede otomotivde henüz kimse yok" cümlesi
 * ürünün en güçlü satış argümanı. Dolu kategorileri listeleyip boşları
 * gizleseydik envanterin çoğu görünmez olurdu.
 */
export async function categoryStandings(scope: Scope): Promise<CategoryStanding[]> {
  const { sql: scopeSql, params: scopeParams } = scopeClause(scope, 1)

  const rows = await q<{
    slug: string; name: string; icon: string; color: string
    bidders: string; pool: string
    leader_key: string | null; leader_url: string | null
    leader_icon: string | null; leader_total: string | null
  }>(
    `SELECT c.slug, c.name, c.icon, c.color,
            COALESCE(agg.bidders, 0) AS bidders,
            COALESCE(agg.pool, 0)    AS pool,
            lead.key AS leader_key, lead.display_url AS leader_url,
            lead.icon_url AS leader_icon, lead.total AS leader_total
       FROM categories c
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT p.advertiser_id) AS bidders, SUM(p.total_cents) AS pool
           FROM placements p
           JOIN territories t2 ON t2.id = p.territory_id
           JOIN advertisers a  ON a.id = p.advertiser_id
          WHERE p.category = c.slug AND p.total_cents > 0
            AND a.moderation_status = 'approved' AND ${scopeSql}
       ) agg ON TRUE
       LEFT JOIN LATERAL (
         -- Kapsamdaki lider, tekil yerleşim değil TOPLAM harcamaya göre:
         -- dünya listesinde "bu kategorinin lideri" küresel toplamdır.
         SELECT a.canonical_key AS key, a.display_url, a.icon_url,
                SUM(p.total_cents) AS total, MIN(p.reached_current_total_at) AS first_reached
           FROM placements p
           JOIN territories t2 ON t2.id = p.territory_id
           JOIN advertisers a  ON a.id = p.advertiser_id
          WHERE p.category = c.slug AND p.total_cents > 0
            AND a.moderation_status = 'approved' AND ${scopeSql}
          GROUP BY a.id, a.canonical_key, a.display_url, a.icon_url
          ORDER BY total DESC, first_reached ASC, a.id ASC
          LIMIT 1
       ) lead ON TRUE
      ORDER BY COALESCE(agg.pool, 0) DESC, c.sort_order ASC`,
    scopeParams,
  )

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    icon: r.icon,
    color: r.color,
    bidders: Number(r.bidders),
    totalCents: Number(r.pool),
    leader: r.leader_key
      ? {
          key: r.leader_key,
          displayUrl: r.leader_url ?? r.leader_key,
          iconUrl: r.leader_icon,
          totalCents: Number(r.leader_total ?? 0),
        }
      : null,
  }))
}

/** Kapsamın özeti — liste başlığındaki sayaçlar. */
export async function scopeTotals(
  scope: Scope,
  category: string | null,
): Promise<{ totalCents: number; advertisers: number; slots: number }> {
  const { sql: scopeSql, params: scopeParams } = scopeClause(scope, 1)
  const catParam = `$${1 + scopeParams.length}`
  const rows = await q<{ pool: string; advertisers: string; slots: string }>(
    `SELECT COALESCE(SUM(p.total_cents), 0)        AS pool,
            COUNT(DISTINCT p.advertiser_id)        AS advertisers,
            COUNT(DISTINCT (p.territory_id, p.category)) AS slots
       FROM placements p
       JOIN territories t2 ON t2.id = p.territory_id
       JOIN advertisers a  ON a.id = p.advertiser_id
      WHERE p.total_cents > 0 AND a.moderation_status = 'approved'
        AND (${catParam}::text IS NULL OR p.category = ${catParam})
        AND ${scopeSql}`,
    [...scopeParams, category],
  )
  const r = rows[0]
  return {
    totalCents: Number(r?.pool ?? 0),
    advertisers: Number(r?.advertisers ?? 0),
    slots: Number(r?.slots ?? 0),
  }
}
