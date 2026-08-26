import type { Metadata } from 'next'
import Flag from '@/components/Flag'
import Pager from '@/components/Pager'
import { BRAND, PRICING, formatMoney } from '@/lib/brand'
import { listCategories, resolveCategory } from '@/lib/categories'
import { getTerritoryBy } from '@/lib/ranking'
import {
  advertiserRanking, categoryStandings, scopeTotals, territoryList,
  type Scope,
} from '@/lib/rankings'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Rankings — ${BRAND.name}`,
  description: `World, country and state rankings by category. ${BRAND.legalNote}`,
  alternates: { canonical: '/list' },
}

type Params = { cat?: string; c?: string; a?: string; p?: string; tp?: string }

/**
 * Sayfa boyu. Liste sonsuza kadar aşağı akmamalı: dünya seviyesinde 241
 * ülke, kalabalık bir kategoride yüzlerce reklamveren olabiliyor. 20 satır
 * telefonda iki-üç ekran; sayfalama bağlantı tabanlı olduğu için her sayfa
 * ayrı bir adres.
 */
const PAGE_SIZE = 20

/** '3' -> 3, çöp veya negatif -> 1. Sayfa numarası istemciden geliyor. */
function pageParam(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Liste görünümü — haritanın klavye ve okuma dostu ikizi.
 *
 * Üç seviye, genelden özele: dünya → ülke → il. Her seviyede aynı iki tablo
 * var: kapsamın reklamveren sıralaması ve o kapsamın altındaki bölgeler.
 * Kategori seçimi bağlantıyla taşınır (?cat=), böylece her görünüm
 * paylaşılabilir bir adres — haritada bu mümkün değildi.
 */
export default async function ListPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams
  const category = await resolveCategory(sp.cat)
  const categories = await listCategories()

  // Kapsamı çöz: il verilmişse il, yoksa ülke, o da yoksa dünya.
  const admin1 = sp.a ? await getTerritoryBy('code', sp.a) : undefined
  const country = admin1?.parent_id
    ? await getTerritoryBy('id', admin1.parent_id)
    : sp.c
      ? await getTerritoryBy('code', sp.c)
      : undefined

  const scope: Scope = admin1
    ? { kind: 'territory', id: admin1.id }
    : country
      ? { kind: 'country', id: country.id }
      : { kind: 'world' }

  // Kapsam özeti sayfalamadan ÖNCE gerekiyor: reklamveren sayısı hem başlık
  // sayacı hem de sıralama sayfa sayısı. İkinci bir COUNT sorgusu yazmak
  // aynı rakamı iki farklı yerden hesaplamak olurdu.
  const totals = await scopeTotals(scope, category)

  const rankPageCount = Math.max(1, Math.ceil(totals.advertisers / PAGE_SIZE))
  const rankPage = Math.min(pageParam(sp.p), rankPageCount)

  const [ranking, standings] = await Promise.all([
    advertiserRanking(scope, category, PAGE_SIZE, (rankPage - 1) * PAGE_SIZE),
    categoryStandings(scope),
  ])

  // Alt seviye listesi: dünyada ülkeler, ülkede iller, ilde yok.
  // Tek seviyede en fazla 241 satır var; sorgu bütünü döner, sayfalama
  // dilimlemeyle yapılır. LIMIT/OFFSET eklemek sıralama ölçütünü
  // (ülke + illeri toplamı) ikinci kez yazmayı gerektirirdi.
  const allChildren = admin1
    ? []
    : await territoryList(country ? country.id : null, category)
  const terrPageCount = Math.max(1, Math.ceil(allChildren.length / PAGE_SIZE))
  const terrPage = Math.min(pageParam(sp.tp), terrPageCount)
  const terrOffset = (terrPage - 1) * PAGE_SIZE
  const children = allChildren.slice(terrOffset, terrOffset + PAGE_SIZE)

  const activeCat = categories.find((c) => c.slug === category) || null
  const scopeName = admin1?.name ?? country?.name ?? 'World'

  /**
   * Kategori/kapsam bağlantısı. Sayfa numaraları BİLEREK taşınmıyor: başka
   * bir ülkeye ya da kategoriye geçerken 7. sayfada kalmak, çoğu zaman boş
   * bir liste göstermek demek.
   */
  const href = (next: { cat?: string | null; c?: string | null; a?: string | null }) => {
    const cat = next.cat === undefined ? category : next.cat
    const c = next.c === undefined ? (country?.code ?? null) : next.c
    const a = next.a === undefined ? (admin1?.code ?? null) : next.a
    const qs = new URLSearchParams()
    if (cat) qs.set('cat', cat)
    if (a) qs.set('a', a)
    else if (c) qs.set('c', c)
    const s = qs.toString()
    return s ? `/list?${s}` : '/list'
  }

  /**
   * Sayfa bağlantısı: kapsam ve diğer bölümün sayfası korunur, yalnız
   * istenen sayaç değişir. Çapa (#) sayesinde okuyucu sayfayı değiştirince
   * listenin başına döner, sayfanın en tepesine değil.
   */
  const pageHref = (which: 'p' | 'tp', n: number) => {
    const qs = new URLSearchParams()
    if (category) qs.set('cat', category)
    if (admin1) qs.set('a', admin1.code)
    else if (country) qs.set('c', country.code)
    const keepP = which === 'p' ? n : rankPage
    const keepT = which === 'tp' ? n : terrPage
    if (keepP > 1) qs.set('p', String(keepP))
    if (keepT > 1) qs.set('tp', String(keepT))
    const s = qs.toString()
    return `/list${s ? `?${s}` : ''}#${which === 'p' ? 'ranking' : 'territories'}`
  }

  const levelLabel = admin1 ? (admin1.subtype || 'State') : country ? 'Country' : 'Worldwide'
  const floor = admin1
    ? PRICING.admin1FloorCents
    : country
      ? PRICING.countryFloorCents
      : PRICING.admin1FloorCents

  return (
    <main className="list-page">
      <header className="list-top">
        <div className="list-top-inner">
          <a className="brand" href="/">
            <span className="dot" aria-hidden="true" />
            <span className="wordmark">{BRAND.wordmark.head}<em>{BRAND.wordmark.tail}</em></span>
          </a>
          <nav className="list-crumbs" aria-label="Breadcrumb">
            <a href={href({ c: null, a: null })}>🌍 World</a>
            {country && (
              <>
                <span aria-hidden="true">›</span>
                <a href={href({ c: country.code, a: null })}>
                  <Flag code={country.code} size={16} /> {country.name}
                </a>
              </>
            )}
            {admin1 && (
              <>
                <span aria-hidden="true">›</span>
                <span aria-current="page">{admin1.name}</span>
              </>
            )}
          </nav>
          <a className="btn btn-ghost btn-sm" href={`/${category ? `?cat=${category}` : ''}`}>
            🌍 Map view
          </a>
        </div>

        {/* Kategori sekmeleri gerçek bağlantı: her kombinasyonun kendi adresi
            var, geri tuşu çalışır, paylaşılabilir. */}
        <div className="catbar list-catbar" role="tablist" aria-label="Category">
          <a
            role="tab"
            aria-selected={category === null}
            className={`cat-chip${category === null ? ' on' : ''}`}
            href={href({ cat: null })}
            aria-label="All categories"
          >
            <span className="cat-icon" aria-hidden="true">🌐</span>
            <span className="cat-name">All</span>
          </a>
          {categories.map((c) => (
            <a
              key={c.slug}
              role="tab"
              aria-selected={category === c.slug}
              className={`cat-chip${category === c.slug ? ' on' : ''}`}
              style={{ '--cat': c.color } as React.CSSProperties}
              href={href({ cat: c.slug })}
              aria-label={c.name}
            >
              <span className="cat-icon" aria-hidden="true">{c.icon}</span>
              <span className="cat-name">{c.name}</span>
            </a>
          ))}
        </div>
      </header>

      <div className="list-body">
        <section className="list-hero">
          <span className="kicker">
            {levelLabel} ranking{activeCat ? ` · ${activeCat.icon} ${activeCat.name}` : ''}
          </span>
          <h1>
            {country && !admin1 && <Flag code={country.code} size={34} />}
            {scopeName}
          </h1>
          <p className="list-sub">
            {activeCat
              ? `Only ${activeCat.name.toLowerCase()} links compete here. Every other category is a separate race.`
              : 'All categories combined. Pick one above to see that race on its own.'}
          </p>
          <div className="list-stats">
            <span><strong>{formatMoney(totals.totalCents)}</strong> total spend</span>
            <span><strong>{totals.advertisers}</strong> advertisers</span>
            <span><strong>{totals.slots}</strong> slots taken</span>
          </div>
        </section>

        {/* --------------------------------------------------- sıralama */}
        <section className="list-section" id="ranking">
          <div className="list-section-head">
            <h2>{admin1 ? `Ranked in ${scopeName}` : `${scopeName} ranking`}</h2>
            <p className="note">
              {admin1
                ? 'Total spend on this slot.'
                : 'Total spend across every slot in this scope.'}
              {totals.advertisers > 0 && (
                <>
                  {' · '}
                  {(rankPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(rankPage * PAGE_SIZE, totals.advertisers)} of {totals.advertisers}
                </>
              )}
            </p>
          </div>

          {ranking.length === 0 ? (
            <div className="list-empty">
              <p>No placements here yet{activeCat ? ` in ${activeCat.name}` : ''}.</p>
              <a className="btn btn-primary btn-sm" href={`/${category ? `?cat=${category}` : ''}`}>
                Claim it · from {formatMoney(floor)}
              </a>
            </div>
          ) : (
            <ol className="lrank">
              {ranking.map((r) => {
                const cat = categories.find((c) => c.slug === r.topCategory)
                return (
                  <li key={r.key} className={r.rank === 1 ? 'leader' : undefined}>
                    <span className="lrank-no">{r.rank === 1 ? '👑' : r.rank}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="avatar" width={30} height={30} alt=""
                      src={`/api/icon?key=${encodeURIComponent(r.key)}`}
                    />
                    <span className="lrank-main">
                      <span className="lrank-name">{r.displayUrl}</span>
                      <span className="lrank-meta">
                        {cat && !category && (
                          <span className="chip cat" style={{ '--cat': cat.color } as React.CSSProperties}>
                            {cat.icon} {cat.name}
                          </span>
                        )}
                        {r.territories} {r.territories === 1 ? 'slot' : 'slots'}
                        {r.leadCount > 0 && ` · #1 in ${r.leadCount}`}
                        {r.clicks > 0 && ` · ${r.clicks} clicks`}
                      </span>
                    </span>
                    <span className="lrank-amt">{formatMoney(r.totalCents)}</span>
                    <a
                      className="visit"
                      href={`${r.outboundUrl}${r.outboundUrl.includes('?') ? '&' : '?'}utm_source=${BRAND.slug}`}
                      target="_blank"
                      rel="sponsored ugc nofollow noopener noreferrer"
                    >
                      Visit ↗
                    </a>
                  </li>
                )
              })}
            </ol>
          )}

          <Pager
            page={rankPage}
            pageCount={rankPageCount}
            hrefFor={(n) => pageHref('p', n)}
            label="Ranking pages"
          />
        </section>

        {/* ------------------------------------------- kategori tablosu */}
        {!category && (
          <section className="list-section">
            <div className="list-section-head">
              <h2>Categories in {scopeName}</h2>
              <p className="note">Each one is its own ranking — and its own slot to buy.</p>
            </div>
            <div className="lcat-grid">
              {standings.map((c) => (
                <a
                  key={c.slug}
                  className={`lcat${c.leader ? '' : ' open'}`}
                  style={{ '--cat': c.color } as React.CSSProperties}
                  href={href({ cat: c.slug })}
                >
                  <span className="lcat-icon" aria-hidden="true">{c.icon}</span>
                  <span className="lcat-main">
                    <span className="lcat-name">{c.name}</span>
                    <span className="lcat-lead">
                      {c.leader
                        ? <>👑 {c.leader.displayUrl} · {formatMoney(c.leader.totalCents)}</>
                        : <>open · from {formatMoney(floor)}</>}
                    </span>
                  </span>
                  <span className="lcat-amt">
                    {c.bidders > 0 ? `${c.bidders} ${c.bidders === 1 ? 'bidder' : 'bidders'}` : '—'}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------ alt bölgeler */}
        {children.length > 0 && (
          <section className="list-section" id="territories">
            <div className="list-section-head">
              <h2>{country ? `States & provinces of ${country.name}` : 'Countries'}</h2>
              <p className="note">
                {allChildren.length} {country ? 'regions' : 'countries'} · ranked by total spend,
                empty ones are still open · {terrOffset + 1}–
                {Math.min(terrOffset + PAGE_SIZE, allChildren.length)} of {allChildren.length}
              </p>
            </div>
            <ol className="lterr">
              {children.map((t, i) => (
                <li key={t.code}>
                  <a
                    className={`lterr-row${t.leader ? '' : ' open'}`}
                    href={country ? href({ a: t.code }) : href({ c: t.code, a: null })}
                  >
                    <span className="lterr-no">{terrOffset + i + 1}</span>
                    <Flag code={country ? country.code : t.code} size={26} />
                    <span className="lterr-main">
                      <span className="lterr-name">{t.name}</span>
                      <span className="lterr-meta">
                        {t.leader
                          ? <>👑 {t.leader.displayUrl}{t.bidders > 1 && ` · ${t.bidders} bidders`}</>
                          : <>open · from {formatMoney(t.basePriceCents)}</>}
                        {t.childCount > 0 && (
                          <> · {t.childFilled}/{t.childCount} states sold</>
                        )}
                      </span>
                    </span>
                    <span className="lterr-amt">
                      {formatMoney(t.totalCents)}
                      {t.childPoolCents > 0 && (
                        <span className="lterr-sub">+{formatMoney(t.childPoolCents)} in states</span>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ol>

            <Pager
              page={terrPage}
              pageCount={terrPageCount}
              hrefFor={(n) => pageHref('tp', n)}
              label={country ? 'Region pages' : 'Country pages'}
            />
          </section>
        )}

        <footer className="list-foot">
          <p className="note">{BRAND.legalNote} {BRAND.adDisclosure}</p>
          <p className="note">
            <a className="link" href="/rules">How it works</a> ·{' '}
            <a className="link" href="/about">About</a> ·{' '}
            <a className="link" href={`/${category ? `?cat=${category}` : ''}`}>Back to the map</a>
          </p>
        </footer>
      </div>
    </main>
  )
}
