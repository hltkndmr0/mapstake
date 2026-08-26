import { NextResponse } from 'next/server'
import { boardLevel } from '@/lib/board'
import { resolveCategory } from '@/lib/categories'
import { getTerritoryBy } from '@/lib/ranking'

export const dynamic = 'force-dynamic'

// Bir ülkenin alt birimlerinin dolu olanları. İstemci yalnız içine girdiği
// ülke için çağırır — 4549 birimin tamamı asla tek seferde gitmez.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const code = params.get('code')
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  const parent = await getTerritoryBy('code', code)
  if (!parent) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  const category = await resolveCategory(params.get('cat'))
  const entries = await boardLevel(parent.id, category)
  const map: Record<string, unknown> = {}
  for (const e of entries) map[e.code] = e
  return NextResponse.json({ parent: parent.code, category, children: map })
}
