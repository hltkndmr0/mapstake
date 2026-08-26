import { renderShareCard } from './card'
import { shareView } from './data'

export const alt = 'Territory standings'
// size/contentType gibi alanlar Next tarafından STATİK olarak okunur:
// başka bir modülden içe aktarılan sabit burada görünmez. Bu yüzden ölçü
// kart çizerinden alınmaz, literal olarak yazılır.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// pg sürücüsü Node çalışma zamanı ister; edge'de çalışmaz.
export const runtime = 'nodejs'
// Sıralama ödeme geldikçe değişir; crawler'a bayat kart göstermemek için kısa.
export const revalidate = 60

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return renderShareCard(await shareView(code))
}
