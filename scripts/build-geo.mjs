// Natural Earth verisini indirir, sadeleştirir ve kendi origin'imize yazar.
// Orijinal worldmap.lol bu veriyi runtime'da jsDelivr/unpkg'den çekiyordu;
// biz build-time'da self-host ediyoruz (tek CDN bağımlılığı yok, sürüm pinli).
//
// Çıktılar:
//   public/geo/countries.json        -> ülke sınırları (TopoJSON, adm0_a3 id'li)
//   public/geo/admin1/<ADM0_A3>.json -> o ülkenin admin-1 birimleri (lazy-load)
//   public/geo/index.json            -> ülke listesi + admin1 var mı + centroid

import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CACHE = join(ROOT, '.geocache')
const OUT = join(ROOT, 'public', 'geo')
const OUT_A1 = join(OUT, 'admin1')

// Natural Earth v5.1.1 — sürümü pinliyoruz, çünkü NE admin-1'i "beta" sayıyor
// ve ülkeler idari birimlerini düzenli olarak yeniden düzenliyor.
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson'
const SOURCES = {
  countries: `${NE}/ne_50m_admin_0_countries.geojson`,
  admin1: `${NE}/ne_10m_admin_1_states_provinces.geojson`,
}

// Antarktika haritada envanter değil (orijinal de filtreliyor).
const SKIP_COUNTRIES = new Set(['ATA'])

function log(...a) { console.log('[geo]', ...a) }

function mapshaper(args) {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'mapshaper', 'bin', 'mapshaper'), ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
    maxBuffer: 1024 * 1024 * 512,
  })
}

function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 1024) {
    log('önbellek:', dest.split('/').pop())
    return
  }
  log('indiriliyor:', url.split('/').pop())
  execFileSync('curl', ['-sL', '--fail', '--max-time', '600', '-o', dest, url], { stdio: 'inherit' })
}

mkdirSync(CACHE, { recursive: true })
mkdirSync(OUT_A1, { recursive: true })

const rawCountries = join(CACHE, 'countries.geojson')
const rawAdmin1 = join(CACHE, 'admin1.geojson')
download(SOURCES.countries, rawCountries)
download(SOURCES.admin1, rawAdmin1)

// ---------------------------------------------------------------- ülkeler
// Sadece ihtiyacımız olan alanları tutuyoruz: kod, ad, iso2.
// %12 sadeleştirme + quantization ile 3 MB -> ~150 KB.
log('ülkeler işleniyor...')
mapshaper([
  rawCountries,
  '-filter', 'ADM0_A3 !== "ATA"',
  '-each', 'this.properties = { code: ADM0_A3, iso2: (ISO_A2_EH && ISO_A2_EH !== "-99") ? ISO_A2_EH : null, name: NAME_EN || NAME }',
  '-simplify', '12%', 'keep-shapes',
  '-clean',
  '-o', join(OUT, 'countries.json'), 'format=topojson', 'id-field=code',
])

// ---------------------------------------------------------------- admin-1
// Tek mapshaper geçişinde ülke başına bir GeoJSON'a bölüyoruz (TopoJSON çıktısı
// katmanları tek dosyada birleştirdiği için lazy-load'a uygun değil), sonra
// her küçük dosyayı Node tarafında TopoJSON'a çeviriyoruz.
// Böylece istemci yalnız açtığı ülkenin birimlerini indirir.
log('admin-1 işleniyor (40 MB kaynak, biraz sürebilir)...')
const tmpA1 = join(CACHE, 'split')
rmSync(tmpA1, { recursive: true, force: true })
mkdirSync(tmpA1, { recursive: true })
mapshaper([
  rawAdmin1,
  '-filter', 'adm0_a3 !== "ATA" && !!adm0_a3',
  '-each', 'this.properties = { code: (iso_3166_2 && iso_3166_2 !== "-99") ? iso_3166_2 : (adm0_a3 + "-" + (adm1_code || name || "X")), name: name_en || name || "—", kind: type_en || type || "Region", adm0: adm0_a3 }',
  '-simplify', '12%', 'keep-shapes',
  '-clean',
  '-split', 'adm0',
  '-o', tmpA1, 'format=geojson',
])

const { topology } = await import('topojson-server')
const { quantize } = await import('topojson-client')
const { geoArea: d3GeoArea } = await import('d3-geo')

/**
 * Halka sarım yönünü düzeltir.
 *
 * d3-geo poligonları KÜRESEL yorumlar: bir halka ters sarılmışsa "kürenin
 * geri kalanı" anlamına gelir ve geoPath dev bir dolgu üretir. mapshaper'ın
 * GeoJSON çıktısı Natural Earth'ün (saat yönü) sarımını koruduğu için
 * admin-1 birimleri bu tuzağa düşüyordu — İstanbul tüm küreyi kaplıyordu.
 *
 * Bir admin-1 birimi asla yarım küreden büyük olamaz; alan 2π'yi aşıyorsa
 * halka kesinlikle terstir, çeviriyoruz.
 */
function fixWinding(geometry) {
  const flipPolygon = (rings) => rings.map((ring) => ring.slice().reverse())
  const areaOf = (geom) => d3GeoArea({ type: 'Feature', geometry: geom, properties: {} })

  if (geometry.type === 'Polygon') {
    if (areaOf(geometry) > 2 * Math.PI) geometry.coordinates = flipPolygon(geometry.coordinates)
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates = geometry.coordinates.map((poly) => {
      const one = { type: 'Polygon', coordinates: poly }
      return areaOf(one) > 2 * Math.PI ? flipPolygon(poly) : poly
    })
  }
  return geometry
}

const produced = readdirSync(tmpA1).filter((f) => f.endsWith('.json'))
const admin1Counts = {}
let flipped = 0
for (const file of produced) {
  const code = file.replace(/\.json$/, '')
  if (!/^[A-Z0-9]{3}$/.test(code) || SKIP_COUNTRIES.has(code)) continue
  const gj = JSON.parse(readFileSync(join(tmpA1, file), 'utf8'))
  const n = gj.features?.length || 0
  // Tek birimli "admin-1" anlamsız (ülkenin kendisiyle aynı) — atla.
  if (n < 2) continue
  for (const f of gj.features) {
    f.id = f.properties.code
    if (f.geometry) {
      const before = d3GeoArea(f)
      fixWinding(f.geometry)
      if (before > 2 * Math.PI) flipped++
    }
  }
  const topo = quantize(topology({ admin1: gj }), 1e4)
  writeFileSync(join(OUT_A1, `${code}.json`), JSON.stringify(topo))
  admin1Counts[code] = n
}
log(`sarım yönü düzeltilen birim: ${flipped}`)
rmSync(tmpA1, { recursive: true, force: true })

// ---------------------------------------------------------------- index
// Ülke listesi + hangi ülkede alt birim var + etiket/kamera için centroid.
log('index üretiliyor...')
const { feature } = await import('topojson-client')
const { geoCentroid, geoArea } = await import('d3-geo')

const countriesTopo = JSON.parse(readFileSync(join(OUT, 'countries.json'), 'utf8'))
const cObjName = Object.keys(countriesTopo.objects)[0]
if (cObjName !== 'countries') {
  countriesTopo.objects = { countries: countriesTopo.objects[cObjName] }
  writeFileSync(join(OUT, 'countries.json'), JSON.stringify(countriesTopo))
}
const fc = feature(countriesTopo, countriesTopo.objects.countries)

const index = fc.features
  .filter((f) => f.properties?.code && !SKIP_COUNTRIES.has(f.properties.code))
  .map((f) => {
    const [lon, lat] = geoCentroid(f)
    return {
      code: f.properties.code,
      iso2: f.properties.iso2 || null,
      name: f.properties.name,
      lon: Math.round(lon * 100) / 100,
      lat: Math.round(lat * 100) / 100,
      // steradian cinsinden alan; etiket gösterilecek kadar büyük mü kararı için
      area: Math.round(geoArea(f) * 1e6) / 1e6,
      admin1: admin1Counts[f.properties.code] || 0,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 0))

const withA1 = index.filter((c) => c.admin1 > 0)
const totalA1 = withA1.reduce((s, c) => s + c.admin1, 0)
log(`bitti: ${index.length} ülke, ${withA1.length} ülkede toplam ${totalA1} alt birim`)
log(`countries.json: ${(statSync(join(OUT, 'countries.json')).size / 1024).toFixed(0)} KB`)
