import { NextResponse } from 'next/server'
import { topPlacements } from '@/lib/board'

export const dynamic = 'force-dynamic'

// Bir ülkenin içine girildiğinde sıralama tablosu o ülkeye daraltılır.
// code yoksa dünya geneli döner.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')
  return NextResponse.json({ scope: code, top: await topPlacements(10, code) })
}
