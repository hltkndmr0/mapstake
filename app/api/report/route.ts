import { NextResponse } from 'next/server'
import { requireCategory, resolveCategory } from '@/lib/categories'
import { reportPlacement, reporterHash } from '@/lib/moderation'

export const dynamic = 'force-dynamic'

/**
 * "Bu ilan yanlış kategoride" bildirimi.
 *
 * Bildirim hiçbir şeyi otomatik değiştirmez — yalnız kuyruğa girer. Otomatik
 * taşıma, rakip bir markayı listeden düşürmek için kötüye kullanılabilirdi;
 * kararı operatör veriyor (scripts/moderate.ts).
 */
export async function POST(req: Request) {
  let body: { code?: string; key?: string; category?: string; suggested?: string; reason?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { code, key } = body
  if (!code || !key) return NextResponse.json({ error: 'code and key are required' }, { status: 400 })

  // Bildirilen ilanın kategorisi zorunlu: aynı marka aynı bölgede birden çok
  // kategoride yarışabiliyor, hangisinin bildirildiği belirsiz kalamaz.
  const category = await requireCategory(body.category)
  const suggested = await resolveCategory(body.suggested)

  const hash = reporterHash(
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    req.headers.get('user-agent'),
  )

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 280) : null

  const res = await reportPlacement({
    territoryCode: code,
    advertiserKey: key,
    category,
    suggestedCategory: suggested,
    reason: reason || null,
    reporterHash: hash,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

  // duplicate bilgisi istemciye VERİLMEZ: "bunu daha önce bildirdin" cevabı,
  // aynı ağdaki başka birinin bildirimini de sızdırırdı.
  return NextResponse.json({ ok: true })
}
