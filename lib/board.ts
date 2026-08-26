import { q, q1 } from './db'

export type BoardEntry = {
  code: string
  slug: string
  name: string
  bidders: number
  totalCents: number
  leader: {
    key: string; displayUrl: string; color: string | null; iconUrl: string | null
    category: string
  } | null
}

/**
 * Bir seviyedeki (ülkeler ya da tek bir ülkenin alt birimleri) dolu bölgeler.
 * Yalnız yerleşimi olanlar döner — boş bölgeler istemcide zaten "boş" durumda.
 *
 * Lider seçimi sıralama kuralının aynısını kullanır:
 * toplam DESC, o toplama ulaşma anı ASC, id ASC.
 */
export async function boardLevel(
  parentId: number | null,
  category: string | null = null,
): Promise<BoardEntry[]> {
  // Kategori seçiliyken harita O kategorinin liderini boyar: "Türkiye'nin
  // yazılım #1'i" ile "Türkiye'nin otomotiv #1'i" farklı markalar olabilir.
  const catParam = parentId === null ? '$1' : '$2'
  const rows = await q<{
    code: string; slug: string; name: string; bidders: string; pool: string
    canonical_key: string; display_url: string; brand_color: string | null
    icon_url: string | null; category: string
  }>(
    `WITH ranked AS (
       SELECT p.territory_id, p.total_cents, p.id AS pid, p.reached_current_total_at,
              a.canonical_key, a.display_url, a.brand_color, a.icon_url, p.category,
              ROW_NUMBER() OVER (
                PARTITION BY p.territory_id
                ORDER BY p.total_cents DESC, p.reached_current_total_at ASC, p.id ASC
              ) AS rn,
              COUNT(*)  OVER (PARTITION BY p.territory_id) AS bidders,
              SUM(p.total_cents) OVER (PARTITION BY p.territory_id) AS pool
         FROM placements p
         JOIN advertisers a ON a.id = p.advertiser_id
        WHERE a.moderation_status = 'approved' AND p.total_cents > 0
          AND (${catParam}::text IS NULL OR p.category = ${catParam})
     )
     SELECT t.code, t.slug, t.name, r.bidders, r.pool,
            r.canonical_key, r.display_url, r.brand_color, r.icon_url, r.category
       FROM ranked r
       JOIN territories t ON t.id = r.territory_id
      WHERE r.rn = 1
        AND ${parentId === null ? 't.parent_id IS NULL' : 't.parent_id = $1'}`,
    parentId === null ? [category] : [parentId, category],
  )

  return rows.map((r) => ({
    code: r.code,
    slug: r.slug,
    name: r.name,
    bidders: Number(r.bidders),
    totalCents: Number(r.pool),
    leader: {
      key: r.canonical_key,
      displayUrl: r.display_url,
      color: r.brand_color,
      iconUrl: r.icon_url,
      category: r.category,
    },
  }))
}

export async function boardTotals() {
  const t = await q1<{ territories: string; advertisers: string }>(
    `SELECT COUNT(DISTINCT p.territory_id)  AS territories,
            COUNT(DISTINCT p.advertiser_id) AS advertisers
       FROM placements p
       JOIN advertisers a ON a.id = p.advertiser_id
      WHERE a.moderation_status = 'approved' AND p.total_cents > 0`,
  )

  // "Toplam harcama" GERÇEK NAKİTTİR: yerleşim toplamlarının toplamı değil.
  // Paket alımlarda tek ödeme iki bölgeye kredi olarak işlendiği için
  // yerleşimleri toplamak rakamı şişirirdi.
  const cash = await q1<{ raised: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS raised FROM payments WHERE status = 'succeeded'`,
  )

  const countries = await q1<{ n: string }>(
    `SELECT COUNT(DISTINCT p.territory_id) AS n
       FROM placements p
       JOIN territories t ON t.id = p.territory_id
      WHERE t.parent_id IS NULL AND p.total_cents > 0`,
  )

  return {
    raisedCents: Number(cash?.raised ?? 0),
    activeTerritories: Number(t?.territories ?? 0),
    activeCountries: Number(countries?.n ?? 0),
    advertisers: Number(t?.advertisers ?? 0),
  }
}

export type TopPlacement = {
  key: string; display_url: string; outbound_url: string
  brand_color: string | null; icon_url: string | null
  title: string | null; territory: string; territory_code: string
  territory_slug: string; kind: string; category: string
  total_cents: number; click_count: number
}

/**
 * En çok destek alan tekil yerleşimler.
 *
 * scopeCode verilirse yalnız o ülkenin kendisi + alt birimleri sayılır.
 * Bir ülkenin içine girildiğinde tabloyu daraltmak için gerekli: kullanıcı
 * Türkiye'ye bakarken dünya sıralamasını görmek istemez.
 */
export async function topPlacements(
  limit = 10,
  scopeCode?: string | null,
  category: string | null = null,
): Promise<TopPlacement[]> {
  const scoped = !!scopeCode
  // Parametre sırası kapsam varlığına göre kayıyor; tek yerde hesaplayıp
  // hem SQL'e hem diziye aynı kaynaktan veriyoruz.
  const catParam = scoped ? '$2' : '$1'
  const limitParam = scoped ? '$3' : '$2'
  const rows = await q<Omit<TopPlacement, 'total_cents' | 'click_count'> & {
    total_cents: string | number; click_count: string | number
  }>(
    `SELECT a.canonical_key AS key, a.display_url, a.outbound_url,
            a.brand_color, a.icon_url, a.title,
            t.name AS territory, t.code AS territory_code, t.slug AS territory_slug, t.kind,
            p.total_cents, p.click_count, p.category
       FROM placements p
       JOIN advertisers a ON a.id = p.advertiser_id
       JOIN territories t ON t.id = p.territory_id
       LEFT JOIN territories pt ON pt.id = t.parent_id
      WHERE a.moderation_status = 'approved' AND p.total_cents > 0
        AND (${catParam}::text IS NULL OR p.category = ${catParam})
        ${scoped ? 'AND (t.code = $1 OR pt.code = $1)' : ''}
      ORDER BY p.total_cents DESC, p.reached_current_total_at ASC, p.id ASC
      LIMIT ${limitParam}`,
    scoped ? [scopeCode, category, limit] : [category, limit],
  )
  return rows.map((r) => ({
    ...r,
    total_cents: Number(r.total_cents),
    click_count: Number(r.click_count),
  }))
}

export async function recentActivity(limit = 12) {
  const rows = await q<{
    id: string; amount_cents: string | number; rank_after: number | null; created_at: Date | string
    territory: string; territory_slug: string; kind: string; category: string
    key: string; display_url: string; brand_color: string | null; icon_url: string | null
  }>(
    `SELECT ac.public_id AS id, ac.amount_cents, ac.rank_after, ac.created_at, ac.category,
            t.name AS territory, t.slug AS territory_slug, t.kind,
            a.canonical_key AS key, a.display_url, a.brand_color, a.icon_url
       FROM activity ac
       JOIN territories  t ON t.id = ac.territory_id
       JOIN advertisers  a ON a.id = ac.advertiser_id
      WHERE a.moderation_status = 'approved'
      ORDER BY ac.created_at DESC, ac.id DESC
      LIMIT $1`,
    [limit],
  )
  // DİKKAT: sağlayıcı ödeme kimliği bu sorguda YOK ve olmamalı.
  return rows.map((r) => ({
    ...r,
    amount_cents: Number(r.amount_cents),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }))
}
