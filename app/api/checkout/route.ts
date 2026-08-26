import { NextResponse } from 'next/server'
import { cancelIntent, computeQuote, createIntent, getTerritoryBy } from '@/lib/ranking'
import { getPaymentProvider, PaymentProviderError } from '@/lib/payments'
import { requireCategory } from '@/lib/categories'

export const dynamic = 'force-dynamic'

// İstemci yalnız "şu bölgeye şu linkle şu kadar" der. Fiyat burada
// yeniden kurulur; gövdeden gelen tutar tabanın altındaysa taban uygulanır.
export async function POST(req: Request) {
  let body: {
    code?: string; url?: string; mode?: string; amountCents?: number
    bundleCode?: string; category?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { code, url, mode, amountCents, bundleCode, category } = body
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

  // Kategori sunucuda doğrulanır ve intent'e YAZILIR: ödeme sonrası hangi
  // yarışa kredi işleneceği istemcinin elinde kalmaz.
  const res = await computeQuote({
    territoryId: t.id, rawUrl: url, mode, amountCents, bundleTerritoryId,
    category: await requireCategory(category),
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

  // Kalıcı kayıt YALNIZ burada: önizleme istekleri veritabanına dokunmaz.
  const provider = getPaymentProvider()
  await createIntent(res.quote, bundleTerritoryId, provider.id)

  const origin = new URL(req.url).origin
  let redirectUrl: string
  try {
    ({ redirectUrl } = await provider.createCheckout(res.quote, origin))
  } catch (error) {
    await cancelIntent(res.quote.quoteId)
    if (error instanceof PaymentProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('Checkout creation failed', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 })
  }

  return NextResponse.json({
    redirectUrl,
    // Kullanıcı ödemeden önce ne aldığını net görsün diye quote'u da döneriz.
    quote: {
      category: res.quote.category,
      amountCents: res.quote.suggestedAmountCents,
      existingTotalCents: res.quote.existingTotalCents,
      projectedTotalCents: res.quote.projectedTotalCents,
      projectedRank: res.quote.projectedRank,
    },
  })
}
