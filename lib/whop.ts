import { createHmac, timingSafeEqual } from 'node:crypto'

export type WhopPaymentSucceededEvent = {
  id: string
  type: 'payment.succeeded'
  account_id?: string
  company_id?: string
  data: {
    id: string
    currency: string
    total: number
    subtotal?: number | null
    metadata?: Record<string, unknown> | null
  }
}

export class WhopWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhopWebhookError'
  }
}

/**
 * Whop Standard Webhooks imzası:
 * HMAC-SHA256("{webhook-id}.{timestamp}.{raw-body}", literal ws_ secret).
 */
export function unwrapWhopWebhook(payload: string, headers: Headers): WhopPaymentSucceededEvent {
  const secret = process.env.WHOP_WEBHOOK_SECRET
  if (!secret) throw new Error('WHOP_WEBHOOK_SECRET is not configured.')

  const messageId = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatures = headers.get('webhook-signature')
  if (!messageId || !timestamp || !signatures) {
    throw new WhopWebhookError('Missing Whop signature headers.')
  }

  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) {
    throw new WhopWebhookError('Invalid Whop webhook timestamp.')
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) {
    throw new WhopWebhookError('Whop webhook timestamp is outside the allowed window.')
  }

  const expected = createHmac('sha256', secret)
    .update(`${messageId}.${timestamp}.${payload}`, 'utf8')
    .digest()

  const valid = signatures.split(' ').some((candidate) => {
    const [version, encoded] = candidate.split(',', 2)
    if (version !== 'v1' || !encoded) return false
    try {
      const received = Buffer.from(encoded, 'base64')
      return received.length === expected.length && timingSafeEqual(received, expected)
    } catch {
      return false
    }
  })
  if (!valid) throw new WhopWebhookError('Invalid Whop webhook signature.')

  let event: unknown
  try { event = JSON.parse(payload) } catch { throw new WhopWebhookError('Invalid Whop payload.') }
  if (!isRecord(event) || event.type !== 'payment.succeeded' || !isRecord(event.data)) {
    throw new WhopWebhookError('Unsupported Whop event.')
  }
  const data = event.data
  if (
    typeof event.id !== 'string' ||
    typeof data.id !== 'string' ||
    typeof data.currency !== 'string' ||
    typeof data.total !== 'number' ||
    !Number.isFinite(data.total) ||
    (data.subtotal !== undefined && data.subtotal !== null && typeof data.subtotal !== 'number')
  ) {
    throw new WhopWebhookError('Incomplete Whop payment payload.')
  }
  return event as WhopPaymentSucceededEvent
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
