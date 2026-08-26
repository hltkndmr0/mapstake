import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { q, q1, tx, one } from './db'
import { PRICING } from './brand'
import { DEFAULT_CATEGORY } from './categories'
import { normalize, type Mode } from './normalize'

export type Territory = {
  id: number
  kind: 'country' | 'admin1'
  parent_id: number | null
  code: string
  slug: string
  name: string
  iso2: string | null
  subtype: string | null
  lon: number
  lat: number
  area: number
  base_price_cents: number
  selectable: boolean
  child_count: number
}

export type Row = {
  placement_id: number
  advertiser_id: number
  mode: Mode
  canonical_key: string
  display_url: string
  outbound_url: string
  title: string | null
  icon_url: string | null
  brand_color: string | null
  total_cents: number
  click_count: number
  reached_current_total_at: string
  category: string
}

/**
 * Sıralama kuralı — ürünün kalbi.
 *   1) Kümülatif toplam büyük olan üstte
 *   2) Eşitse bu toplama ÖNCE ulaşan üstte (first-come tie-break)
 *   3) Yine eşitse id (deterministik)
 * Bu üçlü olmadan sıralama denetlenebilir olmaz.
 */
const ORDER_BY = `ORDER BY p.total_cents DESC, p.reached_current_total_at ASC, p.id ASC`

/**
 * $2 = kategori filtresi. NULL geçilirse bölgedeki BÜTÜN kategoriler tek
 * listede yarışır ("Tümü" görünümü); bir slug geçilirse yalnız o kategori.
 * Tek sorgu iki modu da karşılar — ayrı sorgu yazmak sıralama kuralını
 * iki yere kopyalamak demekti.
 */
const PLACEMENT_SELECT = `
  SELECT p.id AS placement_id, a.id AS advertiser_id, a.mode, a.canonical_key,
         a.display_url, a.outbound_url, a.title, a.icon_url, a.brand_color,
         p.total_cents, p.click_count, p.reached_current_total_at, p.category
    FROM placements p
    JOIN advertisers a ON a.id = p.advertiser_id
   WHERE p.territory_id = $1 AND a.moderation_status = 'approved' AND p.total_cents > 0
     AND ($2::text IS NULL OR p.category = $2)
   ${ORDER_BY}`

function normalizeRows(rows: Array<Record<string, unknown>>): Row[] {
  return rows.map((r) => ({
    ...(r as unknown as Row),
    placement_id: Number(r.placement_id),
    advertiser_id: Number(r.advertiser_id),
    total_cents: Number(r.total_cents),
    click_count: Number(r.click_count),
  }))
}

export async function getTerritoryBy(
  field: 'id' | 'slug' | 'code',
  value: string | number,
): Promise<Territory | undefined> {
  // field sabit bir birlikten geliyor; kullanıcı girdisi buraya ulaşmaz.
  const t = await q1<Territory>(`SELECT * FROM territories WHERE ${field} = $1`, [value])
  if (!t) return undefined
  return { ...t, id: Number(t.id), parent_id: t.parent_id === null ? null : Number(t.parent_id) }
}

export async function listPlacements(territoryId: number, category: string | null = null): Promise<Row[]> {
  return normalizeRows(await q(PLACEMENT_SELECT, [territoryId, category]))
}

/** Aynı sorgunun transaction içinde çalışan hâli. */
async function listPlacementsTx(c: PoolClient, territoryId: number, category: string | null): Promise<Row[]> {
  const r = await c.query(PLACEMENT_SELECT, [territoryId, category])
  return normalizeRows(r.rows)
}

/** Bir bölgenin yeni yerleşim tabanı (ülke mi, il mi). */
export function floorFor(t: Territory, isTopUp: boolean): number {
  return isTopUp ? PRICING.topUpFloorCents : t.base_price_cents
}

export type Quote = {
  quoteId: string
  territory: { id: number; code: string; slug: string; name: string; kind: string }
  category: string
  mode: Mode
  canonicalKey: string
  displayUrl: string
  outboundUrl: string
  existingTotalCents: number
  isTopUp: boolean
  floorCents: number
  suggestedAmountCents: number
  projectedTotalCents: number
  projectedRank: number
  leaderTotalCents: number
  requiredToLeadCents: number
  expiresAt: string
}

/**
 * Lideri geçmek için gereken ÖDEME.
 * Kritik: mevcut toplam düşülür. Orijinaldeki fazla ödeme hatası tam olarak
 * bu çıkarmanın yapılmamasından kaynaklanıyordu ($11 yerine $6 ödenmeli).
 */
export function requiredPaymentFor(targetTotalCents: number, existingTotalCents: number, floorCents: number): number {
  return Math.max(floorCents, targetTotalCents + PRICING.outbidStepCents - existingTotalCents)
}

/** Verilen ödemeyle oluşacak sıra. Eşitlikte yeni gelen ALTTA kalır. */
export function projectRank(rows: Row[], selfAdvertiserId: number | null, projectedTotal: number): number {
  const others = rows.filter((r) => r.advertiser_id !== selfAdvertiserId)
  return others.filter((r) => r.total_cents >= projectedTotal).length + 1
}

/**
 * Teklifi HESAPLAR — hiçbir şey yazmaz.
 *
 * Neden ayrı: teklif ekranı kullanıcı yazdıkça canlı önizleme için bunu
 * çağırıyor. Eskiden her çağrı bir `intents` satırı yazıyordu; yani her tuş
 * duraklamasında bir veritabanı yazması oluyordu ve Postgres'e geçince
 * checkout gözle görülür şekilde yavaşladı. Artık kayıt yalnız gerçek
 * checkout'ta (createIntent) oluşuyor.
 */
export async function computeQuote(params: {
  territoryId: number; rawUrl: string; mode: Mode; amountCents?: number
  bundleTerritoryId?: number | null
  /** Yarışın kapsamı. Taban, mevcut toplam ve lider HEP bu kategori içinde. */
  category?: string
}): Promise<{ ok: true; quote: Quote } | { ok: false; error: string }> {
  const t = await getTerritoryBy('id', params.territoryId)
  if (!t) return { ok: false, error: 'Territory not found.' }
  if (!t.selectable) return { ok: false, error: 'This territory is not available right now.' }

  const n = normalize(params.rawUrl, params.mode)
  if (!n.ok) return { ok: false, error: n.error }

  const category = params.category || DEFAULT_CATEGORY
  const rows = await listPlacements(t.id, category)
  const adv = await q1<{ id: number }>(
    `SELECT id FROM advertisers WHERE mode = $1 AND canonical_key = $2`,
    [n.mode, n.canonicalKey],
  )
  const advId = adv ? Number(adv.id) : null

  const self = advId !== null ? rows.find((r) => r.advertiser_id === advId) : undefined
  const existingTotal = self?.total_cents ?? 0
  const isTopUp = existingTotal > 0
  const floor = floorFor(t, isTopUp)

  const leaderTotal = rows.length > 0 ? rows[0].total_cents : 0
  // Zaten liderse "lider olmak için" gereken şey yoktur -> taban.
  const requiredToLead =
    rows.length > 0 && rows[0].advertiser_id === advId
      ? floor
      : requiredPaymentFor(leaderTotal, existingTotal, floor)

  // Sunucu daima kendi önerisini üretir; istemcinin tutarı yalnız bir istektir.
  const requested = params.amountCents
  const amount = requested && requested >= floor ? Math.round(requested) : requiredToLead

  const projectedTotal = existingTotal + amount
  const expires = new Date(Date.now() + 15 * 60_000).toISOString()

  const quote: Quote = {
    quoteId: randomUUID(),
    territory: { id: t.id, code: t.code, slug: t.slug, name: t.name, kind: t.kind },
    category,
    mode: n.mode,
    canonicalKey: n.canonicalKey,
    displayUrl: n.displayUrl,
    outboundUrl: n.outboundUrl,
    existingTotalCents: existingTotal,
    isTopUp,
    floorCents: floor,
    suggestedAmountCents: amount,
    projectedTotalCents: projectedTotal,
    projectedRank: projectRank(rows, advId, projectedTotal),
    leaderTotalCents: leaderTotal,
    requiredToLeadCents: requiredToLead,
    expiresAt: expires,
  }

  return { ok: true, quote }
}

/** Hesaplanmış teklifi kalıcı intent olarak yazar. Yalnız checkout çağırır. */
export async function createIntent(
  quote: Quote,
  bundleTerritoryId?: number | null,
  provider = 'mock',
): Promise<void> {
  await q(
    `INSERT INTO intents (id, territory_id, mode, canonical_key, display_url, outbound_url,
                          amount_cents, existing_total_cents, projected_rank, expires_at,
                          bundle_territory_id, provider, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      quote.quoteId, quote.territory.id, quote.mode, quote.canonicalKey,
      quote.displayUrl, quote.outboundUrl, quote.suggestedAmountCents,
      quote.existingTotalCents, quote.projectedRank, quote.expiresAt,
      bundleTerritoryId ?? null, provider, quote.category,
    ],
  )
}

/** Sağlayıcı checkout'u oluşturamazsa yarım kalan intent tekrar kullanılamaz. */
export async function cancelIntent(intentId: string): Promise<void> {
  await q(
    `UPDATE intents SET status = 'cancelled' WHERE id = $1 AND status = 'created'`,
    [intentId],
  )
}

/** Dönüş ekranı ödeme sonucunu yalnız sunucu kaydından okur. */
export async function getIntentStatus(intentId: string): Promise<{
  status: string; territoryCode: string; territoryName: string
} | undefined> {
  return q1<{ status: string; territoryCode: string; territoryName: string }>(
    `SELECT i.status, t.code AS "territoryCode", t.name AS "territoryName"
       FROM intents i
       JOIN territories t ON t.id = i.territory_id
      WHERE i.id = $1`,
    [intentId],
  )
}

type IntentRow = {
  id: string; territory_id: number; mode: Mode; canonical_key: string
  display_url: string; outbound_url: string; amount_cents: number
  status: string; provider: string; expires_at: string; bundle_territory_id: number | null
  category: string
}

/**
 * Ödemeyi stake'e çevirir. Gerçek entegrasyonda BURAYI yalnız imzası
 * doğrulanmış webhook çağırır — asla istemci değil.
 * provider_event_id UNIQUE olduğu için aynı olay iki kez gelse de bir kez işlenir.
 */
export async function applyPayment(
  intentId: string,
  providerEventId: string,
  confirmation?: { provider: string; amountCents: number; currency: string },
): Promise<
  { ok: true; duplicate: boolean; territoryId: number; rank: number } | { ok: false; error: string }
> {
  return tx(async (c) => {
    const intent = await one<IntentRow>(c, `SELECT * FROM intents WHERE id = $1 FOR UPDATE`, [intentId])
    if (!intent) return { ok: false as const, error: 'Checkout not found.' }
    const territoryId = Number(intent.territory_id)

    // Idempotency: bu olay daha önce işlendiyse hiçbir şey yazma.
    const existing = await one<{ id: number }>(
      c, `SELECT id FROM payments WHERE provider_event_id = $1`, [providerEventId],
    )
    if (existing) {
      return { ok: true as const, duplicate: true, territoryId, rank: 0 }
    }

    // Aynı intent farklı bir sağlayıcı olayıyla ikinci kez kredilendirilemez.
    if (intent.status === 'paid') {
      return { ok: false as const, error: 'Checkout has already been paid.' }
    }
    if (intent.status !== 'created') {
      return { ok: false as const, error: 'Checkout is not payable.' }
    }
    if (confirmation) {
      if (intent.provider !== confirmation.provider) {
        return { ok: false as const, error: 'Payment provider mismatch.' }
      }
      if (confirmation.currency.toLowerCase() !== 'usd') {
        return { ok: false as const, error: 'Payment currency mismatch.' }
      }
      if (Number(intent.amount_cents) !== confirmation.amountCents) {
        return { ok: false as const, error: 'Payment amount mismatch.' }
      }
    }

    // Reklamveren kaydı (yoksa oluştur).
    let adv = await one<{ id: number }>(
      c, `SELECT id FROM advertisers WHERE mode = $1 AND canonical_key = $2`,
      [intent.mode, intent.canonical_key],
    )
    if (!adv) {
      adv = await one<{ id: number }>(
        c,
        `INSERT INTO advertisers (mode, canonical_key, display_url, outbound_url, icon_url, brand_color)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          intent.mode, intent.canonical_key, intent.display_url, intent.outbound_url,
          `/api/icon?key=${encodeURIComponent(intent.canonical_key)}`,
          colorFor(intent.canonical_key),
        ],
      )
    }
    const advId = Number(adv!.id)
    const amount = Number(intent.amount_cents)

    const pay = await one<{ id: number }>(
      c,
      `INSERT INTO payments (provider_event_id, intent_id, amount_cents, status)
       VALUES ($1,$2,$3,'succeeded') RETURNING id`,
      [providerEventId, intent.id, amount],
    )
    const paymentId = Number(pay!.id)

    // Ödeme HANGİ kategoriye yazılacaksa o intent'te kilitlidir; istemci
    // ödeme sonrası kategoriyi değiştiremez.
    const category = intent.category || 'other'

    const credit = async (terrId: number, bundled: boolean) => {
      const pl = await one<{ id: number; total_cents: number }>(
        c,
        // FOR UPDATE: aynı bölgeye eşzamanlı iki ödeme gelirse satır kilitlenir,
        // toplamlar kaybolmaz.
        `SELECT id, total_cents FROM placements
          WHERE territory_id = $1 AND advertiser_id = $2 AND category = $3 FOR UPDATE`,
        [terrId, advId, category],
      )
      let placementId: number
      let newTotal: number
      if (pl) {
        newTotal = Number(pl.total_cents) + amount
        placementId = Number(pl.id)
        // reached_current_total_at, toplam DEĞİŞTİĞİ an güncellenir -> tie-break doğru kalır.
        await c.query(
          `UPDATE placements SET total_cents = $1, reached_current_total_at = now() WHERE id = $2`,
          [newTotal, placementId],
        )
      } else {
        newTotal = amount
        const ins = await one<{ id: number }>(
          c,
          `INSERT INTO placements (territory_id, advertiser_id, total_cents, category)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [terrId, advId, newTotal, category],
        )
        placementId = Number(ins!.id)
      }

      await c.query(
        `INSERT INTO stake_events (placement_id, payment_id, delta_cents, total_after_cents, bundled)
         VALUES ($1,$2,$3,$4,$5)`,
        [placementId, paymentId, amount, newTotal, bundled],
      )

      // Gerçek sırayı ÖDEME ANINDA hesapla (checkout anındaki tahmin değil).
      // Sıra kategori İÇİNDE anlamlıdır: satın alınan slot budur.
      const rows = await listPlacementsTx(c, terrId, category)
      const rank = rows.findIndex((r) => r.advertiser_id === advId) + 1

      await c.query(
        `INSERT INTO activity (public_id, territory_id, advertiser_id, amount_cents, rank_after, category)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), terrId, advId, amount, rank, category],
      )
      return rank
    }

    const rank = await credit(territoryId, false)

    // Paket: ülke alımıyla birlikte alt birim bedelsiz veriliyor. Ek NAKİT yok;
    // aynı ödeme alt birime de kredi olarak işleniyor ve bundled=TRUE ile
    // işaretleniyor. Mutabakatta nakit yalnız payments tablosundan sayılır.
    if (intent.bundle_territory_id) {
      await credit(Number(intent.bundle_territory_id), true)
    }

    await c.query(`UPDATE intents SET status = 'paid' WHERE id = $1`, [intent.id])

    return { ok: true as const, duplicate: false, territoryId, rank }
  })
}

/** Marka rengi için deterministik pastel üretimi (ikon okunamazsa fallback). */
export function colorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360
  return `hsl(${h} 62% 72%)`
}
