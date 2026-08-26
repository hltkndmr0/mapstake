// Bölge tablosunu geo verisinden doldurur ve haritayı canlı göstermek için
// birkaç örnek yerleşim ekler ("soğuk başlangıç" problemi — boş harita ölü görünür).
//
// Idempotent: tekrar çalıştırılabilir. Bölgeler upsert edilir, demo veri
// yalnız hiç yerleşim yoksa eklenir.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { feature } from 'topojson-client'
import { geoCentroid, geoArea } from 'd3-geo'

const ROOT = process.cwd()
const GEO = join(ROOT, 'public', 'geo')
const COUNTRY_FLOOR = 500
const ADMIN1_FLOOR = 200

// Şema/seed işleri için doğrudan (session-mode) bağlantı tercih edilir;
// uygulama runtime'ı ise transaction pooler'ı kullanır.
const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL
if (!url) { console.error('DATABASE_URL yok.'); process.exit(1) }
if (!existsSync(join(GEO, 'index.json'))) {
  console.error('public/geo/index.json yok. Önce: npm run geo'); process.exit(1)
}

// sslmode parametresi pg'nin açık ssl ayarını ezip SELF_SIGNED_CERT_IN_CHAIN
// hatası veriyor; çıkarıp TLS'i elle kuruyoruz.
function clean(u) {
  try { const x = new URL(u); x.searchParams.delete('sslmode'); return x.toString() } catch { return u }
}

const c = new pg.Client({
  connectionString: clean(url),
  ssl: process.env.PGSSL_DISABLE === '1' ? undefined : { rejectUnauthorized: false },
})
await c.connect()
await c.query(readFileSync(join(ROOT, 'lib', 'schema.sql'), 'utf8'))

function slugify(s) {
  return s.toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

const index = JSON.parse(readFileSync(join(GEO, 'index.json'), 'utf8'))
const prior = (await c.query('SELECT code, slug FROM territories')).rows
const existing = new Map(prior.map((r) => [r.code, r.slug]))
const used = new Set(prior.map((r) => r.slug))
function uniqueSlug(base) {
  let s = base, i = 2
  while (used.has(s)) s = `${base}-${i++}`
  used.add(s)
  return s
}

// Toplu yazma: satır satır INSERT etmek 4.790 bölge için ~9.600 ağ gidiş-dönüşü
// demekti ve dakikalarca sürüyordu. unnest ile tek deyimde yazıyoruz.
const UPSERT_MANY = `
  INSERT INTO territories (kind, parent_id, code, slug, name, iso2, subtype,
                           lon, lat, area, base_price_cents, selectable, child_count)
  SELECT * FROM unnest(
    $1::text[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
    $8::float8[], $9::float8[], $10::float8[], $11::int[], $12::bool[], $13::int[]
  )
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name, lon = EXCLUDED.lon, lat = EXCLUDED.lat,
    area = EXCLUDED.area, child_count = EXCLUDED.child_count
  RETURNING id, code`

/** Sütun dizilerini hazırlayıp tek sorguda yazar; code -> id döner. */
async function writeBatch(rows) {
  if (rows.length === 0) return new Map()
  const cols = Array.from({ length: 13 }, () => [])
  for (const r of rows) {
    cols[0].push(r.kind); cols[1].push(r.parentId); cols[2].push(r.code)
    cols[3].push(r.slug); cols[4].push(r.name); cols[5].push(r.iso2); cols[6].push(r.subtype)
    cols[7].push(r.lon); cols[8].push(r.lat); cols[9].push(r.area)
    cols[10].push(r.price); cols[11].push(true); cols[12].push(r.childCount)
  }
  const res = await c.query(UPSERT_MANY, cols)
  return new Map(res.rows.map((x) => [x.code, x.id]))
}

// Natural Earth'te bazı bölgeler aynı ISO koduyla birden çok poligon olarak
// geliyor (ör. Bosna'nın kantonları hep BA-BIH). Aynı kod = aynı bölge:
// tek kayıt yazıyoruz, haritadaki bütün parçalar aynı sahibi gösteriyor.
// (Postgres da tek komutta aynı satırı iki kez güncelletmiyor.)
const childByCode = new Map()
const childCountByCountry = new Map()
for (const row of index) {
  if (!row.admin1) continue
  const path = join(GEO, 'admin1', `${row.code}.json`)
  if (!existsSync(path)) continue
  const topo = JSON.parse(readFileSync(path, 'utf8'))
  for (const f of feature(topo, topo.objects.admin1).features) {
    const p = f.properties || {}
    if (!p.code || childByCode.has(p.code)) continue
    const [lon, lat] = geoCentroid(f)
    childByCode.set(p.code, {
      kind: 'admin1', parentCode: row.code, code: p.code,
      name: p.name || p.code, iso2: null, subtype: p.kind || null,
      lon: Number.isFinite(lon) ? Math.round(lon * 100) / 100 : row.lon,
      lat: Number.isFinite(lat) ? Math.round(lat * 100) / 100 : row.lat,
      area: Math.round(geoArea(f) * 1e6) / 1e6,
      price: ADMIN1_FLOOR, childCount: 0,
    })
    childCountByCountry.set(row.code, (childCountByCountry.get(row.code) || 0) + 1)
  }
}

// --- 1. geçiş: ülkeler (alt birim sayısı tekilleştirilmiş hâliyle)
const countryRows = index.map((row) => ({
  kind: 'country', parentId: null, code: row.code,
  slug: existing.get(row.code) ?? uniqueSlug(slugify(row.name)),
  name: row.name, iso2: row.iso2, subtype: null,
  lon: row.lon, lat: row.lat, area: row.area,
  price: COUNTRY_FLOOR, childCount: childCountByCountry.get(row.code) || 0,
}))
await c.query('BEGIN')
const idByCode = await writeBatch(countryRows)
const nCountry = countryRows.length

// --- 2. geçiş: alt birimler (ülke id'leri artık elimizde)
const slugByCountry = new Map(countryRows.map((x) => [x.code, x.slug]))
const childRows = [...childByCode.values()].map((r) => ({
  ...r,
  parentId: idByCode.get(r.parentCode),
  slug: existing.get(r.code) ?? uniqueSlug(`${slugByCountry.get(r.parentCode)}/${slugify(r.name)}`),
}))
// Parametre dizisi çok büyümesin diye parçalara bölüyoruz.
for (let i = 0; i < childRows.length; i += 1000) {
  await writeBatch(childRows.slice(i, i + 1000))
}
await c.query('COMMIT')
const nAdmin1 = childRows.length

console.log(`[seed] ${nCountry} ülke, ${nAdmin1} alt birim yazıldı.`)

// ------------------------------------------------------------------ demo
const already = Number((await c.query('SELECT COUNT(*) n FROM placements')).rows[0].n)
if (already > 0) {
  console.log(`[seed] ${already} yerleşim zaten var, demo veri atlandı.`)
  await c.end(); process.exit(0)
}

// Kategoriler ürünün merkezi: demo veri de kategorilere YAYILMALI. Hepsi
// 'software' olsaydı "yazılım otomotivle yarışmıyor" fikri haritada hiç
// görünmezdi — aynı ülkede farklı kategorilerin farklı liderleri var.
const DEMO = [
  { url: 'linear.app',   mode: 'product', cat: 'software',   where: ['TUR', 'DEU', 'TR-34'], amounts: [1200, 500, 800] },
  { url: 'vercel.com',   mode: 'product', cat: 'software',   where: ['USA', 'TUR', 'US-CA'], amounts: [2400, 700, 1500] },
  { url: 'raycast.com',  mode: 'product', cat: 'software',   where: ['DEU', 'FRA', 'TR-34'], amounts: [900, 600, 400] },
  { url: 'togg.com.tr',  mode: 'product', cat: 'automotive', where: ['TUR', 'TR-34', 'DEU'], amounts: [1500, 900, 400] },
  { url: 'rivian.com',   mode: 'product', cat: 'automotive', where: ['USA', 'US-CA'],        amounts: [2100, 1200] },
  { url: 'monzo.com',    mode: 'product', cat: 'finance',    where: ['GBR', 'TUR'],          amounts: [1400, 400] },
  { url: 'getir.com',    mode: 'product', cat: 'food',       where: ['TUR', 'TR-34', 'GBR'], amounts: [1000, 1100, 300] },
  { url: 'trendyol.com', mode: 'product', cat: 'retail',     where: ['TUR', 'TR-35'],        amounts: [1700, 500] },
  { url: 'x.com/naval',  mode: 'social',  cat: 'media',      where: ['USA', 'IND'],          amounts: [1800, 900] },
  { url: 'github.com/vercel/next.js', mode: 'social', cat: 'software', where: ['JPN', 'US-CA'], amounts: [700, 600] },
  { url: 'posthog.com',  mode: 'product', cat: 'software',   where: ['GBR', 'TR-06'],        amounts: [1100, 300] },
  { url: 'resend.com',   mode: 'product', cat: 'software',   where: ['BRA', 'TR-35'],        amounts: [600, 250] },
  { url: 'cal.com',      mode: 'product', cat: 'services',   where: ['ESP', 'TUR'],          amounts: [500, 300] },
  { url: 'gymshark.com', mode: 'product', cat: 'fashion',    where: ['GBR', 'USA', 'TR-34'], amounts: [800, 700, 350] },
  { url: 'airbnb.com',   mode: 'product', cat: 'travel',     where: ['ESP', 'TUR', 'TR-07'], amounts: [1300, 600, 450] },
]
const colorFor = (key) => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360
  return `hsl(${h} 62% 72%)`
}

let clock = Date.now() - 1000 * 60 * 60 * 20
const stamp = () => {
  clock += 1000 * 60 * (8 + Math.floor(Math.random() * 90))
  return new Date(clock).toISOString()
}

let seq = 0
await c.query('BEGIN')
for (const item of DEMO) {
  const key = item.url
  const outbound = `https://${key.replace(/^https?:\/\//, '')}`
  await c.query(
    `INSERT INTO advertisers (mode, canonical_key, display_url, outbound_url, icon_url, brand_color)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (mode, canonical_key) DO NOTHING`,
    [item.mode, key, key, outbound, `/api/icon?key=${encodeURIComponent(key)}`, colorFor(key)],
  )
  const advId = (await c.query(
    'SELECT id FROM advertisers WHERE mode = $1 AND canonical_key = $2', [item.mode, key],
  )).rows[0].id

  for (let i = 0; i < item.where.length; i++) {
    const t = (await c.query('SELECT id FROM territories WHERE code = $1', [item.where[i]])).rows[0]
    if (!t) continue
    const at = stamp()
    const amount = item.amounts[i]
    seq++

    const plId = (await c.query(
      `INSERT INTO placements (territory_id, advertiser_id, total_cents, first_staked_at, reached_current_total_at, category)
       VALUES ($1,$2,$3,$4,$4,$5) RETURNING id`,
      [t.id, advId, amount, at, item.cat],
    )).rows[0].id

    // Demo veri de gerçek ödeme zincirinden geçer: intent -> payment -> stake_event.
    // Aksi halde yerleşimler var ama nakit toplamı 0 görünürdü ("Total spend"
    // bilinçli olarak payments tablosundan sayılıyor).
    const intentId = `seed-intent-${seq}`
    await c.query(
      `INSERT INTO intents (id, territory_id, mode, canonical_key, display_url, outbound_url,
                            amount_cents, existing_total_cents, projected_rank, status, expires_at, created_at, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,1,'paid',$8,$8,$9)`,
      [intentId, t.id, item.mode, key, key, outbound, amount, at, item.cat],
    )
    const payId = (await c.query(
      `INSERT INTO payments (provider_event_id, intent_id, amount_cents, status, created_at)
       VALUES ($1,$2,$3,'succeeded',$4) RETURNING id`,
      [`seed-evt-${seq}`, intentId, amount, at],
    )).rows[0].id
    await c.query(
      `INSERT INTO stake_events (placement_id, payment_id, delta_cents, total_after_cents, bundled, created_at)
       VALUES ($1,$2,$3,$3,FALSE,$4)`,
      [plId, payId, amount, at],
    )
    await c.query(
      `INSERT INTO activity (public_id, territory_id, advertiser_id, amount_cents, rank_after, created_at, category)
       VALUES ($1,$2,$3,$4,1,$5,$6)`,
      [`${advId}-${t.id}-seed`, t.id, advId, amount, at, item.cat],
    )
  }
}
await c.query('COMMIT')
const n = (await c.query('SELECT COUNT(*) n FROM placements')).rows[0].n
console.log(`[seed] ${n} demo yerleşim eklendi.`)
await c.end()
