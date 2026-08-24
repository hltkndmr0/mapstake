'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import Globe, { type Fill, type TerrProps } from './Globe'
import StakeModal from './StakeModal'
import TerritorySearch from './TerritorySearch'
import { BRAND, PRICING, formatMoney } from '@/lib/brand'

export type BoardEntry = {
  code: string; slug: string; name: string; bidders: number; totalCents: number
  leader: { key: string; displayUrl: string; color: string | null; iconUrl: string | null } | null
}
export type Totals = { raisedCents: number; activeTerritories: number; activeCountries: number; advertisers: number }
export type TopRow = {
  key: string; display_url: string; outbound_url: string
  brand_color: string | null; icon_url: string | null
  title: string | null; territory: string; territory_code: string
  territory_slug: string; kind: string
  total_cents: number; click_count: number
}
export type Board = { totals: Totals; countries: Record<string, BoardEntry>; top: TopRow[] }

export type Detail = {
  territory: {
    code: string; slug: string; name: string; kind: 'country' | 'admin1'
    subtype: string | null; lon: number; lat: number; selectable: boolean
    parent: { code: string; name: string; slug: string } | null
    childCount: number
  }
  floorCents: number
  topUpFloorCents: number
  children: { total: number; filled: number; pooledCents: number } | null
  /** İl/eyalet açıkken üst ülkenin durumu — "ülkeyi de al" teklifi için. */
  parentOffer: {
    code: string; name: string; floorCents: number; bidders: number
    leaderKey: string | null; leaderTotalCents: number; requiredToLeadCents: number
  } | null
  placements: Array<{
    rank: number; key: string; displayUrl: string; outboundUrl: string
    title: string | null; iconUrl: string | null; color: string | null
    totalCents: number; clicks: number
  }>
}

type IndexRow = { code: string; iso2: string | null; name: string; lon: number; lat: number; area: number; admin1: number }

const ACTIVITY_MS = 12_000

export default function Stage({ initialBoard }: { initialBoard: Board }) {
  // SSR'dan gelen gerçek veriyle başlıyoruz: orijinaldeki "0 ülke / $0" yanıp
  // sönmesi bu yüzden hiç oluşmuyor.
  const [board, setBoard] = useState<Board>(initialBoard)
  const [countries, setCountries] = useState<FeatureCollection<Geometry, TerrProps> | null>(null)
  const [index, setIndex] = useState<IndexRow[]>([])

  const [drill, setDrill] = useState<string | null>(null)
  const [childGeo, setChildGeo] = useState<FeatureCollection<Geometry, TerrProps> | null>(null)
  const [childBoard, setChildBoard] = useState<Record<string, BoardEntry>>({})
  const [childLoading, setChildLoading] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [activity, setActivity] = useState<Array<{
    id: string; amount_cents: number; rank_after: number | null; created_at: string
    territory: string; kind: string; key: string; display_url: string; brand_color: string | null
  }>>([])

  // Sıralama tablosu: dünya geneli ya da içine girilen ülkeyle sınırlı.
  const [top, setTop] = useState<TopRow[]>(initialBoard.top)
  const [camera, setCamera] = useState<{ lon: number; lat: number; scale: number; nonce: number } | null>(null)
  const [stakeFor, setStakeFor] = useState<Detail | null>(null)
  const [stakePrefill, setStakePrefill] = useState<{ url: string; mode: 'product' | 'social' } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Mobilde alt panel açılır-kapanır; kapalıyken küre tüm ekranı kullanır.
  // İlk açılışta dar ekranda kapalı başlar ki küre ortada tam görünsün.
  const [sheetOpen, setSheetOpen] = useState(true)
  const nonce = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(max-width: 900px), (max-height: 640px)').matches) setSheetOpen(false)
  }, [])

  // ---------------------------------------------------------- ilk yükleme
  useEffect(() => {
    fetch('/geo/countries.json')
      .then((r) => r.json())
      .then((topo) => setCountries(feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, TerrProps>))
      .catch(() => setToast('Could not load map data.'))
    fetch('/geo/index.json').then((r) => r.json()).then(setIndex).catch(() => {})
  }, [])

  const refreshBoard = useCallback(async () => {
    try {
      const b = await fetch('/api/board').then((r) => r.json())
      setBoard(b)
      const t = await fetch(`/api/top${drill ? `?code=${drill}` : ''}`).then((r) => r.json())
      setTop(t.top || [])
      if (drill) {
        const c = await fetch(`/api/board/children?code=${drill}`).then((r) => r.json())
        setChildBoard(c.children || {})
      }
    } catch { /* sessizce geç: eski veri ekranda kalsın */ }
  }, [drill])

  // Bir ülkenin içine girildiğinde/çıkıldığında tabloyu o kapsama daralt.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/top${drill ? `?code=${drill}` : ''}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setTop(d.top || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [drill])

  // Aktivite akışı. Sekme görünmezken durur — orijinal bunu yapmadığı için
  // açık her sekme boşuna istek üretiyordu.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const load = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/activity').then((r) => r.json()).then((d) => setActivity(d.activity || [])).catch(() => {})
    }
    load()
    const start = () => { if (!timer) timer = setInterval(load, ACTIVITY_MS) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVis = () => (document.visibilityState === 'visible' ? (load(), start()) : stop())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // ------------------------------------------------------------- dolgular
  const toFill = (e: BoardEntry | undefined): Fill | undefined =>
    e ? { color: e.leader?.color ?? null, leaderKey: e.leader?.key ?? null, bidders: e.bidders, totalCents: e.totalCents } : undefined

  const fills = useMemo(() => {
    const m: Record<string, Fill> = {}
    for (const [code, e] of Object.entries(board.countries)) { const f = toFill(e); if (f) m[code] = f }
    return m
  }, [board])

  const childFills = useMemo(() => {
    const m: Record<string, Fill> = {}
    for (const [code, e] of Object.entries(childBoard)) { const f = toFill(e); if (f) m[code] = f }
    return m
  }, [childBoard])

  const indexByCode = useMemo(() => {
    const m: Record<string, IndexRow> = {}
    for (const r of index) m[r.code] = r
    return m
  }, [index])

  // ----------------------------------------------------------- yönlendirme
  const loadDetail = useCallback(async (code: string) => {
    setDetailLoading(true)
    try {
      const d: Detail = await fetch(`/api/territory?code=${encodeURIComponent(code)}`).then((r) => r.json())
      setDetail(d)
      return d
    } catch {
      setToast('Could not load this territory.')
      return null
    } finally { setDetailLoading(false) }
  }, [])

  /** Bir ülkenin alt birim katmanını aç (lazy). */
  const enterCountry = useCallback(async (code: string) => {
    const meta = indexByCode[code]
    setDrill(code)
    setChildLoading(true)
    setChildGeo(null)
    setChildBoard({})
    if (meta) {
      const target = Math.max(420, Math.min(2400, 190 / Math.sqrt(Math.max(meta.area, 0.00035))))
      nonce.current += 1
      setCamera({ lon: meta.lon, lat: meta.lat, scale: target, nonce: nonce.current })
    }
    try {
      const [topo, children] = await Promise.all([
        fetch(`/geo/admin1/${code}.json`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/board/children?code=${code}`).then((r) => r.json()).catch(() => ({ children: {} })),
      ])
      if (topo) setChildGeo(feature(topo, topo.objects.admin1) as unknown as FeatureCollection<Geometry, TerrProps>)
      setChildBoard(children.children || {})
    } catch {
      setToast('Could not load subdivisions.')
    } finally { setChildLoading(false) }
  }, [indexByCode])

  const exitCountry = useCallback(() => {
    setDrill(null)
    setChildGeo(null)
    setChildBoard({})
    setSelected(null)
    setDetail(null)
    nonce.current += 1
    // Başlangıç görünümü: rotation [-14, -38] -> merkez lon 14, lat 38.
    setCamera({ lon: 14, lat: 38, scale: 350, nonce: nonce.current })
  }, [])

  const onSelect = useCallback(async (code: string, kind: 'country' | 'admin1') => {
    setSelected(code)
    setSheetOpen(true)
    const d = await loadDetail(code)
    if (!d) return
    if (kind === 'country' && d.territory.childCount > 0 && drill !== code) {
      enterCountry(code)
    } else if (kind === 'country') {
      const meta = indexByCode[code]
      if (meta) {
        nonce.current += 1
        setCamera({ lon: meta.lon, lat: meta.lat, scale: 620, nonce: nonce.current })
      }
    }
  }, [loadDetail, drill, enterCountry, indexByCode])

  /**
   * Arama sonucundan seçim, haritadaki tıklamayla AYNI akışa bağlanır:
   * ülke seçilirse içine girilir ve kamera oraya gider. (Önceden arama yalnız
   * paneli açıyordu; küre yerinde kalıyor, iller hiç yüklenmiyordu.)
   */
  const selectFromSearch = useCallback(async (row: { code: string; kind: 'country' | 'admin1'; parentCode?: string | null }) => {
    setSearchOpen(false)
    if (row.kind === 'country') {
      await onSelect(row.code, 'country')
      return
    }
    // Alt birim: önce ülkesinin katmanını aç, sonra birimi seç.
    if (row.parentCode && row.parentCode !== drill) await enterCountry(row.parentCode)
    setSelected(row.code)
    await loadDetail(row.code)
  }, [drill, enterCountry, loadDetail, onSelect])

  /** "Ülkenin tamamını da al" — il panelinden ülke teklifine geçiş. */
  const claimParent = useCallback(async (code: string) => {
    const d: Detail = await fetch(`/api/territory?code=${encodeURIComponent(code)}`).then((r) => r.json())
    setStakePrefill(null)
    setStakeFor(d)
  }, [])

  // Escape: yalnız en üst katmanı kapatır (orijinalde iç içe modallar
  // birlikte kapanıp kullanıcının bağlamını kaybettiriyordu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (stakeFor) { setStakeFor(null); return }
      if (searchOpen) { setSearchOpen(false); return }
      if (selected) { setSelected(null); setDetail(null); return }
      if (drill) { exitCountry(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stakeFor, searchOpen, selected, drill, exitCountry])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3600)
    return () => clearTimeout(t)
  }, [toast])

  // Ödeme dönüşü: gerçek durumu sunucudan okuyoruz, query'yi kanıt saymıyoruz.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('paid') !== '1') return
    const code = p.get('t')
    setToast('Payment received — your placement is live.')
    refreshBoard()
    if (code) { setSelected(code); loadDetail(code) }
    window.history.replaceState({}, '', window.location.pathname)

    // Teklif ekranında "ülkeyi de al" işaretlenmişse, ödeme dönüşünde
    // ülke teklifini link/mod hazır biçimde aç.
    const pending = sessionStorage.getItem('mapstake.pendingUpsell')
    if (pending) {
      sessionStorage.removeItem('mapstake.pendingUpsell')
      try {
        const u = JSON.parse(pending) as { code: string; url: string; mode: 'product' | 'social' }
        fetch(`/api/territory?code=${encodeURIComponent(u.code)}`)
          .then((r) => r.json())
          .then((d: Detail) => { setStakePrefill({ url: u.url, mode: u.mode }); setStakeFor(d) })
          .catch(() => {})
      } catch { /* bozuk kayıt: yok say */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drillMeta = drill ? indexByCode[drill] : null
  const totals = board.totals

  return (
    <>
      <a className="skip-link" href="#territory-search">Skip to territory search</a>

      <div className="stage">
        {/* Kürenin arkasındaki yıldız alanı (saf CSS, iki parallax katmanı). */}
        <div className="stars" aria-hidden="true" />
        <div className="stars-2" aria-hidden="true" />

        <Globe
          countries={countries}
          subFeatures={childGeo}
          fills={fills}
          childFills={childFills}
          drillCode={drill}
          selectedCode={selected}
          onSelect={onSelect}
          cameraTarget={camera}
          priceCountryCents={PRICING.countryFloorCents}
          priceAdmin1Cents={PRICING.admin1FloorCents}
          paused={!!stakeFor || searchOpen}
        />

        {/* --------------------------------------------------------- sol üst */}
        <header className="overlay o-tl">
          <a className="brand" href="/">
            <span className="dot" aria-hidden="true" />
            Map<em>stake</em>
          </a>
          <div className="card hero">
            <span className="kicker">Ad inventory · {totals.activeTerritories} slots taken</span>
            <h1>{BRAND.tagline}</h1>
            <p>{BRAND.pitch}</p>
            <div className="inv">
              <span className="inv-row">
                <span className="inv-dot country" aria-hidden="true" />
                <strong>241 countries</strong> from {formatMoney(PRICING.countryFloorCents)}
              </span>
              <span className="inv-row">
                <span className="inv-dot state" aria-hidden="true" />
                <strong>4,549 states &amp; provinces</strong> from {formatMoney(PRICING.admin1FloorCents)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setSearchOpen(true)}>
                Buy a slot · from {formatMoney(PRICING.admin1FloorCents)}
              </button>
              <a className="btn btn-ghost btn-sm" href="/rules">How it works</a>
            </div>
          </div>
        </header>

        {/* --------------------------------------------------------- sağ üst */}
        <div className="overlay o-tr card stats" role="status" aria-label="Live counters">
          <div className="stats-row"><span className="k">Slots taken</span><span className="v">{totals.activeTerritories}</span></div>
          <div className="stats-row"><span className="k">Total spend</span><span className="v">{formatMoney(totals.raisedCents)}</span></div>
          <div className="stats-row"><span className="k">Advertisers</span><span className="v">{totals.advertisers}</span></div>
        </div>

        {/* --------------------------------------------------------- sol alt */}
        <section className="overlay o-bl activity-slot card activity" aria-label="Recent placements">
          <div className="act-head"><span className="live-dot" aria-hidden="true" />Recent buys</div>
          {activity.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>No activity yet.</p>
          ) : (
            <ul className="act-list">
              {activity.slice(0, 5).map((a) => (
                <li className="act-item" key={a.id}>
                  <img className="avatar" src={`/api/icon?key=${encodeURIComponent(a.key)}`} alt="" width={26} height={26} />
                  <span className="txt">
                    <span className="name">{a.display_url}</span>
                    <span className="meta">{a.territory} · #{a.rank_after ?? '—'} · {relTime(a.created_at)}</span>
                  </span>
                  <span className="amt">{formatMoney(a.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --------------------------------------------------------- sağ alt */}
        <aside
          className={`overlay o-br card panel${sheetOpen ? '' : ' collapsed'}`}
          aria-label="Territory panel"
        >
          <button
            className="sheet-toggle"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            aria-controls="panel-content"
          >
            <span className="sheet-grip" aria-hidden="true" />
            <span className="sr-only">{sheetOpen ? 'Collapse panel' : 'Expand panel'}</span>
          </button>
          {detail ? (
            <TerritoryPanel
              detail={detail}
              loading={detailLoading}
              childBoard={childBoard}
              childLoading={childLoading}
              drill={drill}
              onBack={() => { setSelected(null); setDetail(null) }}
              onExitCountry={exitCountry}
              onPickChild={(code) => { setSelected(code); loadDetail(code) }}
              onStake={() => { setStakePrefill(null); setStakeFor(detail) }}
              onClaimParent={claimParent}
            />
          ) : (
            <TopSpenders
              top={top}
              drillName={drillMeta?.name || null}
              onExitCountry={exitCountry}
              onOpenSearch={() => setSearchOpen(true)}
            />
          )}
        </aside>

        <div className="overlay o-bc hint" aria-hidden="true">
          drag to spin · scroll to zoom{drill ? ' · Esc to exit' : ''}
        </div>

        <div className="mobile-fabs">
          <button className="btn btn-primary btn-sm" onClick={() => setSearchOpen(true)}>Buy a slot</button>
        </div>
      </div>

      {searchOpen && (
        <TerritorySearch
          index={index}
          board={board.countries}
          onClose={() => setSearchOpen(false)}
          onPick={selectFromSearch}
        />
      )}

      {stakeFor && (
        <StakeModal
          detail={stakeFor}
          prefill={stakePrefill}
          onClose={() => { setStakeFor(null); setStakePrefill(null) }}
          onPaid={async (code) => {
            setStakeFor(null)
            setStakePrefill(null)
            setToast('Payment received — your placement is live.')
            await refreshBoard()
            await loadDetail(code)
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}

/* ------------------------------------------------------------ alt bileşenler */

function TopSpenders({ top, drillName, onExitCountry, onOpenSearch }: {
  top: TopRow[]; drillName: string | null; onExitCountry: () => void; onOpenSearch: () => void
}) {
  return (
    <>
      <div className="panel-head">
        {drillName && (
          <div className="crumbs">
            <button onClick={onExitCountry}>🌍 World</button><span>›</span><span>{drillName}</span>
          </div>
        )}
        <div className="panel-eyebrow">
          <span className="ad-tag">Ad</span> {drillName ? `Top in ${drillName}` : 'Top placements'}
        </div>
        <h2 className="panel-title">{drillName ? drillName : 'The Board'}</h2>
        <p className="panel-sub">
          {drillName
            ? `${drillName} and its states, ranked by total spend.`
            : 'Countries and states ranked by total spend.'}
        </p>
      </div>
      <div className="panel-body">
        {top.length === 0 ? (
          <div className="empty-state">
            <div className="big">🌍</div>
            <p>{drillName ? `No slots sold in ${drillName} yet.` : 'No slots sold yet. Be the first on the map.'}</p>
          </div>
        ) : (
          <ol className="rank-list">
            {top.map((r, i) => (
              <li key={`${r.key}-${r.territory_slug}`}>
                <div className={`rank-row ${i === 0 ? 'leader' : ''}`}>
                  <span className="rank-no">{i === 0 ? '👑' : i + 1}</span>
                  <img className="avatar" src={`/api/icon?key=${encodeURIComponent(r.key)}`} alt="" width={26} height={26} />
                  <span className="rank-main">
                    <span className="rank-name">{r.display_url}</span>
                    <span className="rank-meta">
                      {r.territory}
                      {r.kind === 'admin1' && <span className="chip sub" style={{ marginLeft: 6 }}>state</span>}
                    </span>
                  </span>
                  <span className="rank-amt">{formatMoney(r.total_cents)}</span>
                  <VisitLink url={r.outbound_url} advertiserKey={r.key} territoryCode={r.territory_code} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="panel-foot">
        <button className="btn btn-primary btn-sm" onClick={onOpenSearch}>Buy a slot</button>
        <span className="note">{BRAND.legalNote}</span>
      </div>
    </>
  )
}

function TerritoryPanel({ detail, loading, childBoard, childLoading, drill, onBack, onExitCountry, onPickChild, onStake, onClaimParent }: {
  detail: Detail; loading: boolean
  childBoard: Record<string, BoardEntry>; childLoading: boolean
  drill: string | null
  onBack: () => void; onExitCountry: () => void
  onPickChild: (code: string) => void; onStake: () => void
  onClaimParent: (code: string) => void
}) {
  const t = detail.territory
  const isEmpty = detail.placements.length === 0

  return (
    <>
      <div className="panel-head">
        <div className="crumbs">
          <button onClick={onExitCountry}>🌍 World</button>
          {t.parent && (<><span>›</span><button onClick={() => onPickChild(t.parent!.code)}>{t.parent.name}</button></>)}
          <span>›</span><span>{t.name}</span>
        </div>
        <div className="panel-eyebrow">
          <span className="ad-tag">Ad slot</span>
          {isEmpty ? 'Available' : `${detail.placements.length} advertisers competing`}
          {t.kind === 'admin1' && <span className="chip sub">{t.subtype || 'State'}</span>}
        </div>
        <h2 className="panel-title">{t.name}</h2>
        {detail.children && (
          <p className="panel-sub">
            {detail.children.filled}/{detail.children.total} states sold
            {detail.children.pooledCents > 0 && ` · ${formatMoney(detail.children.pooledCents)} across states`}
            {' · '}<span className="note">states are sold separately</span>
          </p>
        )}
      </div>

      <div className="panel-body">
        {loading ? (
          <div style={{ padding: 10 }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 6 }} />)}
          </div>
        ) : isEmpty ? (
          <div className="empty-state">
            <div className="ghost-slot">
              <span className="ghost-plus">+</span>
              <span>Your ad here</span>
            </div>
            <p>No bids yet — this slot is open.</p>
            <p>Starts at <strong>{formatMoney(detail.floorCents)}</strong>.</p>
          </div>
        ) : (
          <ol className="rank-list">
            {detail.placements.map((p) => (
              <li key={p.key}>
                <div className={`rank-row ${p.rank === 1 ? 'leader' : ''}`}>
                  <span className="rank-no">{p.rank === 1 ? '👑' : p.rank}</span>
                  <img className="avatar" src={`/api/icon?key=${encodeURIComponent(p.key)}`} alt="" width={26} height={26} />
                  <span className="rank-main">
                    <span className="rank-name">{p.displayUrl}</span>
                    <span className="rank-meta">{p.clicks} clicks</span>
                  </span>
                  <span className="rank-amt">{formatMoney(p.totalCents)}</span>
                  <VisitLink url={p.outboundUrl} advertiserKey={p.key} territoryCode={t.code} />
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Çapraz satış: il/eyalet alan biri ülkenin tamamını da isteyebilir.
            Ülke ayrı bir envanter olduğu için bu ikinci bir satıştır. */}
        {t.kind === 'admin1' && detail.parentOffer && (
          <div className="upsell">
            <div className="upsell-head">
              <span className="ad-tag">Upgrade</span>
              Go national
            </div>
            <p className="upsell-body">
              {detail.parentOffer.leaderKey ? (
                <>
                  <strong>{detail.parentOffer.leaderKey}</strong> holds all of{' '}
                  <strong>{detail.parentOffer.name}</strong> at {formatMoney(detail.parentOffer.leaderTotalCents)}.
                  Country ranking is a separate slot from this one.
                </>
              ) : (
                <>
                  Nobody owns <strong>{detail.parentOffer.name}</strong> yet — the national slot is still open.
                </>
              )}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => onClaimParent(detail.parentOffer!.code)}>
              {detail.parentOffer.leaderKey
                ? `Take #1 in ${detail.parentOffer.name} · ${formatMoney(detail.parentOffer.requiredToLeadCents)}`
                : `Claim ${detail.parentOffer.name} · ${formatMoney(detail.parentOffer.floorCents)}`}
            </button>
          </div>
        )}

        {t.childCount > 0 && drill === t.code && (
          <>
            {/* Ziyaretçinin ülke dışında il de alabildiğini anlaması gereken
                tek yer burası — açık bir çağrı olmadan keşfedilmiyordu. */}
            <div className="hintbox">
              <span className="hintbox-icon" aria-hidden="true">📍</span>
              <span>
                <strong>Don&apos;t need the whole country?</strong> Every one of{' '}
                {t.name}&apos;s {t.childCount} states is its own ad slot — tap one on the map
                to claim it from {formatMoney(PRICING.admin1FloorCents)}.
              </span>
            </div>
            <div className="panel-eyebrow" style={{ padding: '12px 10px 6px' }}>States &amp; provinces</div>
            {childLoading ? (
              <div className="sub-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}</div>
            ) : (
              <div className="sub-grid">
                {Object.values(childBoard)
                  .sort((a, b) => b.totalCents - a.totalCents)
                  .slice(0, 12)
                  .map((c) => (
                    <button key={c.code} className="sub-cell" onClick={() => onPickChild(c.code)}>
                      <span className="sub-swatch" style={{ background: c.leader?.color || 'var(--land)' }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="nm">{c.name}</span>
                        <span className="am">{formatMoney(c.totalCents)} · {c.bidders} ads</span>
                      </span>
                    </button>
                  ))}
                {Object.keys(childBoard).length === 0 && (
                  <p className="note" style={{ gridColumn: '1 / -1', padding: '4px 8px' }}>
                    Every state here is still open. Click one on the map to claim it.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel-foot">
        <button className="btn btn-primary btn-sm" onClick={onStake}>
          {isEmpty ? `Claim · ${formatMoney(detail.floorCents)}` : 'Outbid'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>Back</button>
      </div>
    </>
  )
}

/**
 * Reklamverene giden dış bağlantı.
 *
 * - rel="sponsored ugc nofollow": ödemeli ve kullanıcı üretimi link olduğunu
 *   arama motorlarına açıkça bildirir (orijinal üründe eksikti).
 * - Tık sendBeacon ile sayılır: sekme kapansa bile istek tamamlanır.
 */
function VisitLink({ url, advertiserKey, territoryCode }: {
  url: string; advertiserKey: string; territoryCode: string
}) {
  return (
    <a
      className="visit"
      href={`${url}${url.includes('?') ? '&' : '?'}utm_source=mapstake`}
      target="_blank"
      rel="sponsored ugc nofollow noopener noreferrer"
      onClick={() => {
        const body = JSON.stringify({ key: advertiserKey, code: territoryCode })
        navigator.sendBeacon?.('/api/click', new Blob([body], { type: 'application/json' }))
      }}
      title={`Visit ${advertiserKey}`}
    >
      Visit ↗
    </a>
  )
}

function relTime(iso: string): string {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
