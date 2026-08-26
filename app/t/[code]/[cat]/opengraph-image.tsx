import { resolveCategory } from '@/lib/categories'
import { renderShareCard } from '../card'
import { shareView } from '../data'

export const alt = 'Category standings'
// size/contentType gibi alanlar Next tarafından STATİK olarak okunur:
// başka bir modülden içe aktarılan sabit burada görünmez. Bu yüzden ölçü
// kart çizerinden alınmaz, literal olarak yazılır.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'
export const revalidate = 60

export default async function Image({ params }: { params: Promise<{ code: string; cat: string }> }) {
  const { code, cat } = await params
  // Kategori doğrulanmazsa kart bölgenin birleşik sıralamasıyla üretilir;
  // sayfa zaten 404 verdiği için bu kart hiçbir zaman paylaşılmaz.
  return renderShareCard(await shareView(code, await resolveCategory(cat)))
}
