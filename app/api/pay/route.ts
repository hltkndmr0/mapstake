import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { applyPayment } from '@/lib/ranking'

export const dynamic = 'force-dynamic'

/**
 * MOCK ÖDEME ONAYI — gerçek webhook'un yerini tutar.
 *
 * Üretimde bu route SİLİNİR ve yerine imza doğrulayan
 * /api/webhooks/<saglayici> gelir. applyPayment() aynı kalır.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAY !== '1') {
    return NextResponse.json({ error: 'Mock payment is disabled' }, { status: 403 })
  }
  let body: { intentId?: string; eventId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!body.intentId) return NextResponse.json({ error: 'intentId is required' }, { status: 400 })

  // eventId istemciden gelebiliyor: aynı id ile iki kez çağırıp
  // idempotency'nin çalıştığını test edebilmek için.
  const eventId = body.eventId || `evt_${randomUUID()}`
  const res = await applyPayment(body.intentId, eventId)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, duplicate: res.duplicate, rank: res.rank, eventId })
}
