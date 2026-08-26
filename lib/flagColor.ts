import { flagUrl } from './flags'

/**
 * Bir ülkenin bayrağından arayüz aksan rengi.
 *
 * Neden çalışma anında çıkarılıyor da elle bir tablo tutulmuyor: 238 ülke
 * için elle renk yazmak hem baştan yanlış hem de bakımı imkânsız. Bayrak
 * dosyası zaten kendi origin'imizde, dolayısıyla canvas "tainted" olmuyor
 * ve pikselleri okuyabiliyoruz.
 *
 * Ortalama DEĞİL baskın renk alınır: kırmızı-beyaz bir bayrağın ortalaması
 * pembeye düşer ve hiçbir ülkeye benzemez. Bunun yerine doygunluğu yüksek
 * kovalar sayılır, en kalabalık olan kazanır.
 */

const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

const SIZE = 24 // 24x18'e indirgeme: renk dağılımı için fazlasıyla yeterli.

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function extract(img: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = Math.round((SIZE * 3) / 4)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  } catch {
    // Aynı origin olmasına rağmen bir tarayıcı politikası engellerse
    // renk yok sayılır; arayüz nötr tonda kalır.
    return null
  }

  // 16 tonluk kovalar. Daha ince ayrım aynı bayrağın gölgelerini ayrı
  // renk sanıp baskın rengi bölerdi.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    const [h, s, l] = rgbToHsl(r, g, b)
    // Beyaz, siyah ve grinin aksanı yok: her ülkeyi birbirine benzetir.
    if (s < 0.22 || l < 0.12 || l > 0.9) continue
    const key = Math.round(h * 16) % 16
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    cur.n++; cur.r += data[i]; cur.g += data[i + 1]; cur.b += data[i + 2]
    buckets.set(key, cur)
  }

  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const v of buckets.values()) if (!best || v.n > best.n) best = v
  if (!best || best.n < 6) return null

  const r = Math.round(best.r / best.n)
  const g = Math.round(best.g / best.n)
  const b = Math.round(best.b / best.n)
  return `rgb(${r} ${g} ${b})`
}

/** Ülke kodundan aksan rengi. Sonuç önbelleklenir; bayrak yoksa null. */
export function flagAccent(code: string | null | undefined): Promise<string | null> {
  if (!code || typeof window === 'undefined') return Promise.resolve(null)
  if (cache.has(code)) return Promise.resolve(cache.get(code) ?? null)
  const existing = pending.get(code)
  if (existing) return existing

  const url = flagUrl(code)
  if (!url) { cache.set(code, null); return Promise.resolve(null) }

  const task = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      let color: string | null = null
      try { color = extract(img) } catch { color = null }
      cache.set(code, color)
      pending.delete(code)
      resolve(color)
    }
    img.onerror = () => {
      cache.set(code, null)
      pending.delete(code)
      resolve(null)
    }
    img.src = url
  })
  pending.set(code, task)
  return task
}
