// Tüm marka metinleri tek yerde. Adı/sloganı değiştirmek isterseniz
// yalnızca bu dosyayı düzenlemeniz yeterli.
export const BRAND = {
  name: 'Mapstake',
  domain: 'mapstake.app',
  tagline: 'Buy the world, one region at a time.',
  pitch: 'Every country and every state is an ad slot. Your rank is your total spend.',
  // Ürünün hukuki niteliği. Bu ifadeleri silmeyin: ürünün bahis/şans oyunu
  // olmadığını her yüzeyde açıkça belirtmek bilinçli bir sigortadır.
  legalNote: 'This is an ad placement purchase — not a bet, prize or game of chance.',
  adDisclosure: 'Sponsored listings submitted by users.',
  contactEmail: 'support@mapstake.app',
} as const

// Fiyat politikası — tek kaynak. Arayüz metni, quote ve doğrulama
// hepsi buradan beslenir (orijinaldeki $5/$2 çelişkisi bu yüzden oluşuyordu).
export const PRICING = {
  countryFloorCents: 500, // yeni ülke yerleşimi tabanı
  admin1FloorCents: 200, // yeni il/eyalet yerleşimi tabanı
  topUpFloorCents: 100, // mevcut yerleşimi büyütmenin tabanı
  outbidStepCents: 100, // lideri geçmek için gereken minimum fark
} as const

export const CURRENCY = 'USD'

export function formatMoney(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/**
 * Mutlak URL üretimi için sitenin kökü.
 *
 * metadataBase burada kritik: OG görselleri mutlak URL olarak yayınlanır ve
 * çözümlenmeyen bir domaine işaret ederse paylaşım önizlemesi boş çıkar.
 * BRAND.domain henüz yayında olmadığı için sıra şu: açık ayar -> Vercel'in
 * ürettiği production adresi -> marka domaini.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`
  return `https://${BRAND.domain}`
}
