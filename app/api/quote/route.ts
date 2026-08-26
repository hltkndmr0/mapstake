import { NextResponse } from 'next/server'
import { computeQuote } from '@/lib/ranking'
import { getTerritoryBy } from '@/lib/ranking'
import { requireCategory } from '@/lib/categories'

export const dynamic = 'force-dynamic'

// Fiyatın TEK otoritesi. İstemcinin gönderdiği tutar sadece bir istektir;
// taban, mevcut toplam ve gereken fark burada yeniden hesaplanır.
export async function POST(req: Request) {
  let body: { code?: string; url?: string; mode?: string; amountCents?: number; category?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { code, url, mode, amountCents, category } = body
  if (!code || !url) return NextResponse.json({ error: 'code and url are required' }, { status: 400 })
  if (mode !== 'product' && mode !== 'social') return NextResponse.json({ error: 'invalid mode' }, { status: 400 })

  const t = await getTerritoryBy('code', code)
  if (!t) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  // Kategori yarışın kapsamı: taban da, lideri geçme farkı da bunun içinde.
  const res = await computeQuote({
    territoryId: t.id, rawUrl: url, mode, amountCents,
    category: await requireCategory(category),
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json(res.quote)
}
