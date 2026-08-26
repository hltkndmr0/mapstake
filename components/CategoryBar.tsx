'use client'

import type { Category } from '@/lib/categories'

/**
 * Kategori seçici — haritanın kapsam anahtarı.
 *
 * "All" ilk sırada ve varsayılan: ürünü ilk kez gören biri kategori kavramını
 * bilmeden de haritayı görebilmeli. Bir kategori seçildiği anda harita, tablo
 * ve panel aynı yarışı gösterir.
 *
 * Yatayda kaydırılır; dar ekranda satır kırmak yerine kaydırma tercih edildi,
 * çünkü 15 kategori üç satıra yayılınca kürenin üstünü kapatıyordu.
 */
export default function CategoryBar({
  categories, value, onChange, counts,
}: {
  categories: Category[]
  value: string | null
  onChange: (slug: string | null) => void
  /** Opsiyonel: kategori başına dolu slot sayısı. */
  counts?: Record<string, number>
}) {
  if (categories.length === 0) return null

  return (
    <div className="catbar" role="tablist" aria-label="Category">
      <button
        role="tab"
        aria-selected={value === null}
        className={`cat-chip${value === null ? ' on' : ''}`}
        onClick={() => onChange(null)}
        aria-label="All categories"
        title="All categories"
      >
        <span className="cat-icon" aria-hidden="true">🌐</span>
        <span className="cat-name">All</span>
      </button>

      {categories.map((c) => (
        <button
          key={c.slug}
          role="tab"
          aria-selected={value === c.slug}
          className={`cat-chip${value === c.slug ? ' on' : ''}`}
          onClick={() => onChange(c.slug)}
          style={{ '--cat': c.color } as React.CSSProperties}
          aria-label={c.name}
          title={`Rank in ${c.name} only`}
        >
          <span className="cat-icon" aria-hidden="true">{c.icon}</span>
          <span className="cat-name">{c.name}</span>
          {counts?.[c.slug] ? <span className="cat-count">{counts[c.slug]}</span> : null}
        </button>
      ))}
    </div>
  )
}
