import { NextResponse } from 'next/server'
import { q1 } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Gerçek, tanımlı metrikler. Orijinaldeki "watching + 3" yapay artırması
// bilinçli olarak yok — sayı neyi sayıyorsa onu gösterir.
export async function GET() {
  const stakes48h = await q1<{ n: string }>(
    `SELECT COUNT(*) AS n FROM activity WHERE created_at >= now() - interval '48 hours'`,
  )
  const advertisers = await q1<{ n: string }>(
    `SELECT COUNT(DISTINCT advertiser_id) AS n FROM placements WHERE total_cents > 0`,
  )
  return NextResponse.json({
    stakes48h: Number(stakes48h?.n ?? 0),
    advertisers: Number(advertisers?.n ?? 0),
  })
}
