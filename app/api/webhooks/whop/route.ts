import { NextResponse } from 'next/server'
import { applyPayment } from '@/lib/ranking'
import { unwrapWhopWebhook, WhopWebhookError } from '@/lib/whop'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rawBody = await req.text()
  let event
  try {
    event = unwrapWhopWebhook(rawBody, req.headers)
  } catch (error) {
    if (error instanceof WhopWebhookError) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 401 })
    }
    console.error('Whop webhook configuration error', error)
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 })
  }

  const configuredAccount = process.env.WHOP_ACCOUNT_ID ?? process.env.WHOP_COMPANY_ID
  const eventAccount = event.account_id ?? event.company_id
  if (!configuredAccount || eventAccount !== configuredAccount) {
    return NextResponse.json({ error: 'Account mismatch' }, { status: 400 })
  }

  const metadata = event.data.metadata
  const intentId = typeof metadata?.intent_id === 'string' ? metadata.intent_id : null
  const metadataAmount = typeof metadata?.expected_amount_cents === 'string'
    ? Number(metadata.expected_amount_cents)
    : NaN
  // Whop total'e vergi ekleyebilir; Mapstake yerleşim bedeli vergi öncesi
  // subtotal'dır. Promo kodları kapalı olduğu için subtotal intent ile eşleşir.
  const amountCents = Math.round((event.data.subtotal ?? event.data.total) * 100)

  if (
    !intentId ||
    !Number.isSafeInteger(metadataAmount) ||
    metadataAmount !== amountCents ||
    event.data.currency.toLowerCase() !== 'usd'
  ) {
    return NextResponse.json({ error: 'Payment details mismatch' }, { status: 400 })
  }

  const eventId = req.headers.get('webhook-id')!
  const result = await applyPayment(intentId, eventId, {
    provider: 'whop',
    amountCents,
    currency: event.data.currency,
  })
  if (!result.ok) {
    console.error('Whop payment fulfillment rejected', {
      eventId,
      paymentId: event.data.id,
      reason: result.error,
    })
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, duplicate: result.duplicate })
}
