/**
 * Sayfalama — bağlantı tabanlı.
 *
 * Neden düğme değil de <a>: liste görünümünün tamamı sunucuda üretiliyor.
 * Her sayfanın kendi adresi olunca geri tuşu, yeni sekmede açma, paylaşma ve
 * arama motoru taraması bedava geliyor; istemcide durum tutmaya gerek kalmıyor.
 *
 * Kenarlar + geçerli sayfanın komşuları gösterilir, arası "…" ile atlanır:
 * 241 ülke 25'erli sayfalarken 10 numara sığar ama 100 numara sığmaz.
 */
export default function Pager({
  page, pageCount, hrefFor, label,
}: {
  page: number
  pageCount: number
  /** Sayfa numarasından adres üretir; çağıran taraf diğer parametreleri korur. */
  hrefFor: (page: number) => string
  label: string
}) {
  if (pageCount <= 1) return null

  const nums: Array<number | '…'> = []
  for (let i = 1; i <= pageCount; i++) {
    const edge = i === 1 || i === pageCount
    const near = Math.abs(i - page) <= 1
    if (edge || near) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }

  return (
    <nav className="pager" aria-label={label}>
      <a
        className={`pager-step${page <= 1 ? ' off' : ''}`}
        href={page > 1 ? hrefFor(page - 1) : undefined}
        aria-disabled={page <= 1}
        rel="prev"
      >
        ‹ Prev
      </a>

      <span className="pager-nums">
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
          ) : (
            <a
              key={n}
              className={`pager-num${n === page ? ' on' : ''}`}
              href={hrefFor(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={`Page ${n}`}
            >
              {n}
            </a>
          ),
        )}
      </span>

      <a
        className={`pager-step${page >= pageCount ? ' off' : ''}`}
        href={page < pageCount ? hrefFor(page + 1) : undefined}
        aria-disabled={page >= pageCount}
        rel="next"
      >
        Next ›
      </a>
    </nav>
  )
}
