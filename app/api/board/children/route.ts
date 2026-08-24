import { NextResponse } from 'next/server'
import { boardLevel } from '@/lib/board'
import { getTerritoryBy } from '@/lib/ranking'

export const dynamic = 'force-dynamic'

// Bir ülkenin alt birimlerinin dolu olanları. İstemci yalnız içine girdiği
// ülke için çağırır — 4549 birimin tamamı asla tek seferde gitmez.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  const parent = await getTerritoryBy('code', code)
  if (!parent) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  const entries = await boardLevel(parent.id)
  const map: Record<string, unknown> = {}
  for (const e of entries) map[e.code] = e
  return NextResponse.json({ parent: parent.code, children: map })
}
