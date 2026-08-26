// Bayrak varlıklarını kendi origin'imize kopyalar.
//
// Neden kopyalıyoruz da CDN'den çekmiyoruz: küre üzerinde aynı anda ~200
// bayrak <pattern> olarak isteniyor. Üçüncü parti bir host'ta bu, her
// ziyaretçi için 200 çapraz-origin isteği ve tek bir kesintide "dünyanın
// yarısı gri" demek. public/geo ile aynı gerekçe: veri repoda durur.
//
// Kaynak: flag-icons (MIT), 4x3 SVG seti. Yalnız index.json'daki ülkelerin
// bayrağı kopyalanır — 271 dosyanın tamamı değil.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'node_modules', 'flag-icons', 'flags', '4x3')
const OUT = join(ROOT, 'public', 'flags')
const INDEX = join(ROOT, 'public', 'geo', 'index.json')

if (!existsSync(SRC)) {
  console.error('flag-icons bulunamadı. Önce: npm install')
  process.exit(1)
}
if (!existsSync(INDEX)) {
  console.error('public/geo/index.json yok. Önce: npm run geo')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const index = JSON.parse(readFileSync(INDEX, 'utf8'))
const available = new Set(readdirSync(SRC).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)))

let copied = 0
const missing = []
const manifest = {}

for (const row of index) {
  const iso2 = (row.iso2 || '').toLowerCase()
  if (!iso2 || !available.has(iso2)) { missing.push(row.code); continue }
  // SVG'ler zaten sadeleştirilmiş; olduğu gibi kopyalanır.
  const svg = readFileSync(join(SRC, `${iso2}.svg`), 'utf8')
  writeFileSync(join(OUT, `${iso2}.svg`), svg)
  manifest[row.code] = iso2
  copied++
}

// code -> iso2 haritası: istemci ülke KODUYLA çalışır (TUR), bayrak dosyası
// ISO2 ile adlanır (tr). Eşleme lib/ altında tutulur çünkü hem sunucu (liste
// sayfası) hem istemci (küre) derleme anında import eder — ekstra bir istek
// yapılmaz ve bayrağı olmayan ülke (KAS/SOL/CYN) sessizce elenir.
writeFileSync(
  join(ROOT, 'lib', 'flag-manifest.json'),
  JSON.stringify(manifest, null, 0) + '\n',
)

console.log(`[flags] ${copied} bayrak kopyalandı, ${missing.length} ülkede bayrak yok: ${missing.join(', ') || '—'}`)
