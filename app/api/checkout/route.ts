import { NextResponse } from 'next/server'
import { computeQuote, createIntent, getTerritoryBy } from '@/lib/ranking'
import { provider } from '@/lib/payments'

export const dynamic = 'force-dynamic'

// İstemci yalnız "şu bölgeye şu linkle şu kadar" der. Fiyat burada
// yeniden kurulur; gövdeden gelen tutar tabanın altındaysa taban uygulanır.
export async function POST(req: Request) {
  let body: { code?: string; url?: string; mode?: string; amountCents?: number; bundleCode?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { code, url, mode, amountCents, bundleCode } = body
  if (!code || !url || (mode !== 'product' && mode !== 'social')) {
    return NextResponse.json({ error: 'Missing or invalid field' }, { status: 400 })
  }
  const t = await getTerritoryBy('code', code)
  if (!t) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  // Paket: ülke ödemesiyle birlikte bedelsiz verilecek alt birim.
  // Sunucu tarafında DOĞRULANIR — alt birim gerçekten bu ülkenin çocuğu olmalı,
  // yoksa istemci herhangi bir bölgeyi bedavaya isteyebilirdi.
  let bundleTerritoryId: number | null = null
  if (bundleCode) {
    const b = await getTerritoryBy('code', bundleCode)
    if (!b || b.parent_id !== t.id) {
      return NextResponse.json({ error: 'Invalid bundle territory' }, { status: 400 })
    }
    bundleTerritoryId = b.id
  }

  const res = await computeQuote({ territoryId: t.id, rawUrl: url, mode, amountCents, bundleTerritoryId })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

  // Kalıcı kayıt YALNIZ burada: önizleme istekleri veritabanına dokunmaz.
  await createIntent(res.quote, bundleTerritoryId)

  const origin = new URL(req.url).origin
  const { redirectUrl } = await provider.createCheckout(res.quote, origin)

  return NextResponse.json({
    redirectUrl,
    // Kullanıcı ödemeden önce ne aldığını net görsün diye quote'u da döneriz.
    quote: {
      amountCents: res.quote.suggestedAmountCents,
      existingTotalCents: res.quote.existingTotalCents,
      projectedTotalCents: res.quote.projectedTotalCents,
      projectedRank: res.quote.projectedRank,
    },
  })
}
