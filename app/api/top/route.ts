import { NextResponse } from 'next/server'
import { topPlacements } from '@/lib/board'
import { resolveCategory } from '@/lib/categories'

export const dynamic = 'force-dynamic'

// Bir ülkenin içine girildiğinde sıralama tablosu o ülkeye daraltılır.
// code yoksa dünya geneli döner; cat verilirse yalnız o kategori.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const code = params.get('code')
  const category = await resolveCategory(params.get('cat'))
  return NextResponse.json({ scope: code, category, top: await topPlacements(10, code, category) })
}
