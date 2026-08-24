import Stage from '@/components/Stage'
import { boardLevel, boardTotals, topPlacements } from '@/lib/board'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Board sunucuda hazırlanıp bileşene veriliyor: sayfa ilk boyamada
  // gerçek rakamlarla geliyor, "0 bölge / $0" yanıp sönmesi hiç oluşmuyor.
  const entries = await boardLevel(null)
  const countries: Record<string, (typeof entries)[number]> = {}
  for (const e of entries) countries[e.code] = e

  return <Stage initialBoard={{ totals: await boardTotals(), countries, top: await topPlacements(10) }} />
}
