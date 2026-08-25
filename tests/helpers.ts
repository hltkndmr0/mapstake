import type { Row, Territory } from '../lib/ranking'

/** Sıralama testleri için minimal bölge. */
export function territory(over: Partial<Territory> = {}): Territory {
  return {
    id: 1, kind: 'country', parent_id: null, code: 'TR', slug: 'turkiye',
    name: 'Türkiye', iso2: 'TR', subtype: null, lon: 35, lat: 39, area: 780,
    base_price_cents: 500, selectable: true, child_count: 81,
    ...over,
  }
}

/**
 * projectRank yalnız advertiser_id ve total_cents okur; kalan alanlar
 * sıralamayı etkilemediği için testlerde doldurulmuyor.
 */
export function row(advertiser_id: number, total_cents: number): Row {
  return { advertiser_id, total_cents } as Row
}
