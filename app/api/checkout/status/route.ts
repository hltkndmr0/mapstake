import { NextResponse } from 'next/server'
import { getIntentStatus } from '@/lib/ranking'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const intentId = new URL(req.url).searchParams.get('intent')
  if (!intentId) return NextResponse.json({ error: 'intent is required' }, { status: 400 })

  const intent = await getIntentStatus(intentId)
  if (!intent) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  return NextResponse.json(intent, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
