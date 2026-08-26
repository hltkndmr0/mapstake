import { NextResponse } from 'next/server'
import { boardLevel, boardTotals, topPlacements } from '@/lib/board'
import { listCategories, resolveCategory } from '@/lib/categories'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Kategori seçiliyken harita, tablo ve sayaçlar aynı kapsamı gösterir;
  // yoksa iki yüzey farklı gerçek anlatır.
  const category = await resolveCategory(new URL(req.url).searchParams.get('cat'))
  const entries = await boardLevel(null, category)
  const countries: Record<string, unknown> = {}
  for (const e of entries) countries[e.code] = e
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    category,
    categories: await listCategories(),
    totals: await boardTotals(),
    countries,
    top: await topPlacements(10, null, category),
  })
}
