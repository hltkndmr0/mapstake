import { colorFor } from '@/lib/ranking'

/**
 * Marka ikonu — kendi origin'imizden üretilen deterministik SVG.
 *
 * Bilinçli tercih: orijinal ürün ikonları DuckDuckGo/Google/unavatar'dan
 * HOTLINK ediyor; bu her ziyaretçinin IP'sini üçüncü taraflara açıyor ve
 * sayfayı dış servislerin ayakta olmasına bağımlı kılıyor.
 *
 * Gerçek favicon istenirse doğru yol: kuyrukta çalışan bir worker'ın siteyi
 * güvenli biçimde çekmesi (private IP bloklama, redirect limiti, boyut/timeout
 * sınırı, MIME allowlist), sonucu kendi depomuza yazması ve buradan sunması.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key') || '?'
  const color = colorFor(key)

  // Alan adının ilk harfi; sosyal profillerde handle'ın ilk harfi.
  const label = (key.split('/').pop() || key).replace(/^www\./, '')
  const letter = (label[0] || '?').toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${escapeXml(label)}">
<rect width="64" height="64" rx="16" fill="${color}"/>
<text x="32" y="33" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="700"
      fill="#1F2B3E" text-anchor="middle" dominant-baseline="central">${escapeXml(letter)}</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!),
  )
}
