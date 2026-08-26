import type { Metadata } from 'next'
import { BRAND, formatMoney } from '@/lib/brand'
import { sharePath, shareScope, type ShareView } from './data'

/**
 * Paylaşım başlıkları — iki route için tek kaynak.
 *
 * Kategori başlığa giriyor çünkü kart artık kategoriye özel: "vercel.com is #1
 * in Software & Tech, Turkey" ile "…is #1 in Turkey" farklı iddialar.
 */
export function shareMetadata(view: ShareView | null): Metadata {
  if (!view) return { title: `Territory not found — ${BRAND.name}` }

  const leader = view.entries[0]
  const scope = shareScope(view)
  const path = sharePath(view.code, view.category?.slug)

  const title = leader
    ? `${leader.displayUrl} is #1 in ${scope} — ${BRAND.name}`
    : `${scope} is available from ${formatMoney(view.floorCents)} — ${BRAND.name}`

  const description = leader
    ? `${view.bidders} advertiser${view.bidders === 1 ? '' : 's'} competing in ${scope}. ` +
      `Leader total ${formatMoney(leader.totalCents)}. ${BRAND.legalNote}`
    : `No advertiser has claimed ${scope} yet. Placements start at ${formatMoney(view.floorCents)}. ` +
      BRAND.legalNote

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, type: 'website', siteName: BRAND.name, url: path },
    twitter: { card: 'summary_large_image', title, description },
  }
}
