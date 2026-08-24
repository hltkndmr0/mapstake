import { NextResponse } from 'next/server'
import { boardLevel, boardTotals, topPlacements } from '@/lib/board'

export const dynamic = 'force-dynamic'

export async function GET() {
  const entries = await boardLevel(null)
  const countries: Record<string, unknown> = {}
  for (const e of entries) countries[e.code] = e
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: await boardTotals(),
    countries,
    top: await topPlacements(10),
  })
}
