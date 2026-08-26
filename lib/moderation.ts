import { createHash } from 'node:crypto'
import { q, q1, tx, one } from './db'

/**
 * Kategori moderasyonu.
 *
 * Kategoriyi reklamverenin kendisi seçiyor ve bu, kötüye kullanılabilir bir
 * serbestlik: kalabalık bir yarıştan kaçıp boş bir kategoride #1 görünmek
 * ucuz bir oyun. Satın alma anında engellemenin güvenilir bir yolu yok —
 * bir alan adının hangi sektöre ait olduğunu makine kesin bilemez, yanlış
 * pozitif doğrudan kayıp satış demek.
 *
 * Bu yüzden döngü sonradan işliyor:
 *   ziyaretçi bildirir -> operatör taşır/gizler -> her işlem loglanır.
 *
 * Taşıma işlemi para tablolarına DOKUNMAZ: ödemeler, stake olayları ve nakit
 * mutabakatı olduğu gibi kalır, yalnız yerleşimin yarıştığı liste değişir.
 */

export type OpenReport = {
  id: number
  placementId: number
  advertiserKey: string
  territoryCode: string
  territoryName: string
  currentCategory: string
  suggestedCategory: string | null
  reason: string | null
  reports: number
  firstReportedAt: string
}

/**
 * Bildireni tekilleştiren özet.
 *
 * Ham IP TUTULMAZ. Tek amaç aynı ziyaretçinin aynı yerleşimi tekrar tekrar
 * bildirmesini engellemek; kimlik değil, çakışma anahtarı üretiyoruz.
 * Tuz ortamdan gelir, böylece veritabanı sızsa bile özet başka bir veriyle
 * eşleştirilemez.
 */
export function reporterHash(ip: string | null, userAgent: string | null): string {
  const salt = process.env.REPORT_SALT ?? 'cartogram-report'
  return createHash('sha256').update(`${salt}|${ip ?? ''}|${userAgent ?? ''}`).digest('hex').slice(0, 32)
}

/** Bir ziyaretçinin gün içinde açabileceği bildirim sayısı. */
const DAILY_REPORT_CAP = 10

export async function reportPlacement(params: {
  territoryCode: string
  advertiserKey: string
  category: string
  suggestedCategory: string | null
  reason: string | null
  reporterHash: string
}): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  const placement = await q1<{ id: string }>(
    `SELECT p.id
       FROM placements p
       JOIN territories t ON t.id = p.territory_id
       JOIN advertisers a ON a.id = p.advertiser_id
      WHERE t.code = $1 AND a.canonical_key = $2 AND p.category = $3`,
    [params.territoryCode, params.advertiserKey, params.category],
  )
  if (!placement) return { ok: false, error: 'Listing not found.' }

  const recent = await q1<{ n: string }>(
    `SELECT COUNT(*) AS n FROM category_reports
      WHERE reporter_hash = $1 AND created_at >= now() - interval '24 hours'`,
    [params.reporterHash],
  )
  if (Number(recent?.n ?? 0) >= DAILY_REPORT_CAP) {
    return { ok: false, error: 'Too many reports from here today.' }
  }

  // UNIQUE (placement_id, reporter_hash): aynı kişinin ikinci bildirimi
  // sessizce yutulur — kullanıcıya hata göstermek bilgi sızdırır ve
  // "gönderildi" demek zaten doğrudur.
  const inserted = await q<{ id: string }>(
    `INSERT INTO category_reports (placement_id, suggested_category, reason, reporter_hash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (placement_id, reporter_hash) DO NOTHING
     RETURNING id`,
    [Number(placement.id), params.suggestedCategory, params.reason, params.reporterHash],
  )
  return { ok: true, duplicate: inserted.length === 0 }
}

/** Açık bildirimler, aynı yerleşim için olanlar gruplanmış hâlde. */
export async function openReports(limit = 50): Promise<OpenReport[]> {
  const rows = await q<{
    id: string; placement_id: string; key: string; code: string; name: string
    category: string; suggested: string | null; reason: string | null
    n: string; first_at: Date | string
  }>(
    `SELECT MIN(r.id)                     AS id,
            p.id                          AS placement_id,
            a.canonical_key               AS key,
            t.code, t.name, p.category,
            -- En çok önerilen kategori: operatöre hazır bir karar önerisi.
            (array_agg(r.suggested_category) FILTER (WHERE r.suggested_category IS NOT NULL))[1] AS suggested,
            (array_agg(r.reason) FILTER (WHERE r.reason IS NOT NULL))[1] AS reason,
            COUNT(*)                      AS n,
            MIN(r.created_at)             AS first_at
       FROM category_reports r
       JOIN placements  p ON p.id = r.placement_id
       JOIN territories t ON t.id = p.territory_id
       JOIN advertisers a ON a.id = p.advertiser_id
      WHERE r.status = 'open'
      GROUP BY p.id, a.canonical_key, t.code, t.name, p.category
      ORDER BY COUNT(*) DESC, MIN(r.created_at) ASC
      LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    placementId: Number(r.placement_id),
    advertiserKey: r.key,
    territoryCode: r.code,
    territoryName: r.name,
    currentCategory: r.category,
    suggestedCategory: r.suggested,
    reason: r.reason,
    reports: Number(r.n),
    firstReportedAt: r.first_at instanceof Date ? r.first_at.toISOString() : String(r.first_at),
  }))
}

/**
 * Yerleşimi başka bir kategoriye taşır.
 *
 * Marka hedef kategoride ZATEN yarışıyorsa iki satır birleştirilir: yeni bir
 * satır açmak (bölge, reklamveren, kategori) tekilliğini bozardı, taşımayı
 * reddetmek de yanlış kategoriyi yerinde bırakırdı. Birleştirmede toplamlar
 * ve tık sayaçları toplanır, stake olayları hedefe taşınır — para geçmişi
 * kaybolmaz.
 */
export async function recategorize(
  placementId: number,
  toCategory: string,
  actor: string,
): Promise<{ ok: true; merged: boolean; totalCents: number } | { ok: false; error: string }> {
  return tx(async (c) => {
    const src = await one<{
      id: string; territory_id: string; advertiser_id: string
      category: string; total_cents: number; click_count: number; first_staked_at: Date
    }>(c, `SELECT * FROM placements WHERE id = $1 FOR UPDATE`, [placementId])
    if (!src) return { ok: false as const, error: 'Placement not found.' }
    if (src.category === toCategory) return { ok: false as const, error: 'Already in that category.' }

    const known = await one<{ slug: string }>(
      c, `SELECT slug FROM categories WHERE slug = $1`, [toCategory],
    )
    if (!known) return { ok: false as const, error: `Unknown category: ${toCategory}` }

    const dst = await one<{ id: string; total_cents: number; click_count: number; first_staked_at: Date }>(
      c,
      `SELECT id, total_cents, click_count, first_staked_at FROM placements
        WHERE territory_id = $1 AND advertiser_id = $2 AND category = $3 FOR UPDATE`,
      [Number(src.territory_id), Number(src.advertiser_id), toCategory],
    )

    let merged = false
    let finalId = Number(src.id)
    let total = Number(src.total_cents)

    if (dst) {
      merged = true
      finalId = Number(dst.id)
      total = Number(dst.total_cents) + Number(src.total_cents)
      // Para geçmişi hedefe taşınır; silinen satırla birlikte gitmez.
      await c.query(`UPDATE stake_events SET placement_id = $1 WHERE placement_id = $2`, [finalId, src.id])
      // Bildirimler de taşınır: kaynak satır silinince CASCADE ile yok olurlardı.
      await c.query(`UPDATE category_reports SET placement_id = $1 WHERE placement_id = $2`, [finalId, src.id])
      await c.query(
        `UPDATE placements
            SET total_cents = $1,
                click_count = click_count + $2,
                first_staked_at = LEAST(first_staked_at, $3),
                reached_current_total_at = now()
          WHERE id = $4`,
        [total, Number(src.click_count), src.first_staked_at, finalId],
      )
      await c.query(`DELETE FROM placements WHERE id = $1`, [src.id])
    } else {
      await c.query(`UPDATE placements SET category = $1 WHERE id = $2`, [toCategory, src.id])
    }

    // Akıştaki rozet de düzelsin: olay kaydı "ne olduğunu" anlatıyor, kayıt
    // yanlış kategoriyle kalırsa geçmiş yanlış bilgi taşır.
    await c.query(
      `UPDATE activity SET category = $1
        WHERE advertiser_id = $2 AND territory_id = $3 AND category = $4`,
      [toCategory, Number(src.advertiser_id), Number(src.territory_id), src.category],
    )
    await c.query(
      `UPDATE clicks SET category = $1
        WHERE advertiser_id = $2 AND territory_id = $3 AND category = $4`,
      [toCategory, Number(src.advertiser_id), Number(src.territory_id), src.category],
    )

    await c.query(
      `UPDATE category_reports SET status = 'accepted', resolved_at = now()
        WHERE placement_id = $1 AND status = 'open'`,
      [finalId],
    )
    await c.query(
      `INSERT INTO moderation_log (action, placement_id, advertiser_id, detail, actor)
       VALUES ('recategorize', $1, $2, $3, $4)`,
      [
        finalId, Number(src.advertiser_id),
        JSON.stringify({ from: src.category, to: toCategory, merged, totalCents: total }),
        actor,
      ],
    )

    return { ok: true as const, merged, totalCents: total }
  })
}

/**
 * Reklamvereni gizler ya da geri açar.
 *
 * Bütün okuma sorguları `moderation_status = 'approved'` filtresi taşıyor,
 * yani gizlenen marka haritadan, listeden ve karttan aynı anda düşer.
 * Ödemesi silinmez: para geçmişi ve iade kararı ayrı bir konu.
 */
export async function setAdvertiserStatus(
  key: string,
  status: 'approved' | 'hidden' | 'blocked',
  actor: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adv = await q1<{ id: string }>(
    `UPDATE advertisers SET moderation_status = $1 WHERE canonical_key = $2 RETURNING id`,
    [status, key],
  )
  if (!adv) return { ok: false, error: `Advertiser not found: ${key}` }

  await q(
    `INSERT INTO moderation_log (action, advertiser_id, detail, actor)
     VALUES ($1, $2, $3, $4)`,
    [`status:${status}`, Number(adv.id), JSON.stringify({ key, note: note ?? null }), actor],
  )
  return { ok: true }
}

/** Bildirimi işleme almadan kapatır. */
export async function dismissReports(
  placementId: number,
  actor: string,
): Promise<number> {
  const rows = await q<{ id: string }>(
    `UPDATE category_reports SET status = 'rejected', resolved_at = now()
      WHERE placement_id = $1 AND status = 'open' RETURNING id`,
    [placementId],
  )
  if (rows.length > 0) {
    await q(
      `INSERT INTO moderation_log (action, placement_id, detail, actor)
       VALUES ('dismiss', $1, $2, $3)`,
      [placementId, JSON.stringify({ count: rows.length }), actor],
    )
  }
  return rows.length
}
