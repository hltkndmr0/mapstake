import Stage from '@/components/Stage'
import { boardLevel, boardTotals, topPlacements } from '@/lib/board'
import { listCategories } from '@/lib/categories'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Board sunucuda hazırlanıp bileşene veriliyor: sayfa ilk boyamada
  // gerçek rakamlarla geliyor, "0 bölge / $0" yanıp sönmesi hiç oluşmuyor.
  // Kategoriler de aynı yükte gidiyor — ayrı bir istek, ilk boyamada
  // kategori çubuğunun boş görünmesi demekti.
  const entries = await boardLevel(null)
  const countries: Record<string, (typeof entries)[number]> = {}
  for (const e of entries) countries[e.code] = e

  return (
    <Stage
      initialBoard={{
        totals: await boardTotals(),
        countries,
        top: await topPlacements(10),
        categories: await listCategories(),
      }}
    />
  )
}
