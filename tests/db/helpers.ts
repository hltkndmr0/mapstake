import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Veritabanına dokunan kod için test koşumu.
 *
 * Neden gerçek Postgres: sorguların yarısı pencere fonksiyonu, LATERAL,
 * DISTINCT ON ve `FOR UPDATE` kullanıyor. Bunları taklit eden bir bellek
 * içi motor, testin geçtiği ama üretimin patladığı bir yanılsama üretir —
 * yani test etmemekten daha kötüsü.
 *
 * Kurulum (bir kez):
 *   createdb cartogram_test
 *   TEST_DATABASE_URL=postgres://localhost/cartogram_test npm test
 *
 * TEST_DATABASE_URL yoksa bu testler ATLANIR; `npm test` yine de saf
 * fonksiyon testleriyle çalışır ve CI'yi kilitlemez.
 */
const RAW_URL = process.env.TEST_DATABASE_URL ?? ''

/**
 * GÜVENLİK KİLİDİ.
 *
 * resetDb() bütün tabloları TRUNCATE ediyor. Birinin TEST_DATABASE_URL'e
 * yanlışlıkla üretim adresini yazması, tek komutla canlı veriyi silmek
 * demek. Bu yüzden veritabanı ADI 'test' içermiyorsa hiçbir şey çalışmaz.
 */
function assertTestDatabase(url: string): string {
  let name: string
  try {
    name = new URL(url).pathname.replace(/^\//, '')
  } catch {
    throw new Error(`TEST_DATABASE_URL ayrıştırılamadı: ${url}`)
  }
  if (!/test/i.test(name)) {
    throw new Error(
      `Güvenlik: test veritabanının adı 'test' içermeli (gelen: "${name}"). ` +
      'Bu kontrol, üretim adresinin yanlışlıkla TRUNCATE edilmesini önler.',
    )
  }
  return url
}

export const DB_URL = RAW_URL ? assertTestDatabase(RAW_URL) : ''
export const DB_TESTS_ENABLED = DB_URL !== ''
export const SKIP_REASON = 'TEST_DATABASE_URL tanımlı değil (bkz. tests/db/helpers.ts)'

// lib/db bağlantı adresini havuzu ilk kullanıldığında okur; testler bu yüzden
// import sırasına bağlı kalmadan hedefi buradan değiştirebiliyor.
if (DB_TESTS_ENABLED) {
  process.env.DATABASE_URL = DB_URL
  process.env.PGSSL_DISABLE = '1'
}

type DbModule = typeof import('../../lib/db')
let dbModule: DbModule | null = null

async function db(): Promise<DbModule> {
  if (!dbModule) dbModule = await import('../../lib/db')
  return dbModule
}

/** Şemayı uygular. Idempotent olduğu için her koşumda çağrılabilir. */
export async function applySchema(): Promise<void> {
  const { q } = await db()
  await q(readFileSync(join(process.cwd(), 'lib', 'schema.sql'), 'utf8'))
}

/** Kategoriler hariç her şeyi siler; kimlik sayaçları başa döner. */
export async function resetDb(): Promise<void> {
  const { q } = await db()
  await q(`TRUNCATE moderation_log, category_reports, clicks, activity, stake_events,
                    payments, intents, placements, advertisers, territories
           RESTART IDENTITY CASCADE`)
}

export async function closeDb(): Promise<void> {
  if (!dbModule) return
  await dbModule.pool().end()
  dbModule = null
}

// ------------------------------------------------------------------ fixture

export type Fixture = {
  countryId: number
  countryCode: string
  provinceId: number
  provinceCode: string
  otherCountryId: number
  otherCountryCode: string
}

/**
 * Bir ülke + bir ili + ikinci bir ülke.
 *
 * Kapsam sorguları (dünya / ülke+illeri / tek bölge) ancak üç seviyeli bir
 * kurulumda ayrışır; tek ülkeyle yazılan test, kapsam filtresi tamamen
 * bozuk olsa bile geçerdi.
 */
export async function seedTerritories(): Promise<Fixture> {
  const { q1 } = await db()
  const country = await q1<{ id: string }>(
    `INSERT INTO territories (kind, parent_id, code, slug, name, iso2, lon, lat, area,
                              base_price_cents, child_count)
     VALUES ('country', NULL, 'TST', 'testland', 'Testland', 'TS', 0, 0, 1, 500, 1)
     RETURNING id`,
  )
  const countryId = Number(country!.id)

  const province = await q1<{ id: string }>(
    `INSERT INTO territories (kind, parent_id, code, slug, name, subtype, lon, lat, area,
                              base_price_cents, child_count)
     VALUES ('admin1', $1, 'TS-01', 'testland/first', 'First Province', 'Province', 0, 0, 0.1, 200, 0)
     RETURNING id`,
    [countryId],
  )

  const other = await q1<{ id: string }>(
    `INSERT INTO territories (kind, parent_id, code, slug, name, iso2, lon, lat, area,
                              base_price_cents, child_count)
     VALUES ('country', NULL, 'OTH', 'otherland', 'Otherland', 'OT', 10, 10, 1, 500, 0)
     RETURNING id`,
  )

  return {
    countryId,
    countryCode: 'TST',
    provinceId: Number(province!.id),
    provinceCode: 'TS-01',
    otherCountryId: Number(other!.id),
    otherCountryCode: 'OTH',
  }
}

/**
 * Gerçek ödeme zincirinden geçen bir satın alma: intent -> applyPayment.
 *
 * Doğrudan INSERT ile yerleşim yazmıyoruz. Testin değeri tam olarak bu
 * zincirin kendisini doğrulamasında; kısayol kullanmak sınanan kodu
 * atlamak olurdu.
 */
export async function buy(opts: {
  territoryCode: string
  url: string
  category: string
  amountCents: number
  bundleCode?: string
  eventId?: string
}): Promise<{ ok: boolean; rank: number; duplicate: boolean; error?: string; intentId: string }> {
  const { computeQuote, createIntent, applyPayment, getTerritoryBy } = await import('../../lib/ranking')

  const t = await getTerritoryBy('code', opts.territoryCode)
  if (!t) throw new Error(`bölge yok: ${opts.territoryCode}`)

  let bundleId: number | null = null
  if (opts.bundleCode) {
    const b = await getTerritoryBy('code', opts.bundleCode)
    bundleId = b ? b.id : null
  }

  const quote = await computeQuote({
    territoryId: t.id,
    rawUrl: opts.url,
    mode: 'product',
    amountCents: opts.amountCents,
    category: opts.category,
    bundleTerritoryId: bundleId,
  })
  if (!quote.ok) throw new Error(`quote başarısız: ${quote.error}`)

  await createIntent(quote.quote, bundleId, 'mock')
  const eventId = opts.eventId ?? `evt-${quote.quote.quoteId}`
  const res = await applyPayment(quote.quote.quoteId, eventId)

  return res.ok
    ? { ok: true, rank: res.rank, duplicate: res.duplicate, intentId: quote.quote.quoteId }
    : { ok: false, rank: 0, duplicate: false, error: res.error, intentId: quote.quote.quoteId }
}

/** Bir yerleşimin toplamını okur (yoksa null). */
export async function placementTotal(
  territoryCode: string,
  key: string,
  category: string,
): Promise<number | null> {
  const { q1 } = await db()
  const row = await q1<{ total_cents: number }>(
    `SELECT p.total_cents
       FROM placements p
       JOIN territories t ON t.id = p.territory_id
       JOIN advertisers a ON a.id = p.advertiser_id
      WHERE t.code = $1 AND a.canonical_key = $2 AND p.category = $3`,
    [territoryCode, key, category],
  )
  return row ? Number(row.total_cents) : null
}

/** Kasaya giren gerçek nakit (paket kredileri hariç). */
export async function cashCents(): Promise<number> {
  const { q1 } = await db()
  const row = await q1<{ n: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE status = 'succeeded'`,
  )
  return Number(row?.n ?? 0)
}
