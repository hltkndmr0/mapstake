'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoCentroid } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type TerrProps = { code: string; name: string; kind?: string; adm0?: string }
export type Fill = { color: string | null; leaderKey: string | null; bidders: number; totalCents: number }

const W = 1100
const H = 760
const SCALE_MIN = 280
const SCALE_MAX = 20000
const IDLE_MS = 3000
const SPIN_DEG_PER_SEC = 3.5

type Rotation = [number, number, number]

export type GlobeProps = {
  countries: FeatureCollection<Geometry, TerrProps> | null
  /** Subdivisions of the country being drilled into (lazy loaded) */
  subFeatures?: FeatureCollection<Geometry, TerrProps> | null
  fills: Record<string, Fill>
  childFills: Record<string, Fill>
  drillCode: string | null
  selectedCode: string | null
  onSelect: (code: string, kind: 'country' | 'admin1') => void
  onClearFocus: () => void
  cameraTarget: { lon: number; lat: number; scale: number; nonce: number } | null
  /** Modal/arama açıkken true: küre yeniden çizilmez. */
  paused?: boolean
  /** Boş bölgede gösterilecek fiyat etiketi için taban fiyatlar (cent). */
  priceCountryCents: number
  priceAdmin1Cents: number
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ekranda yer kaplayan her etiket/rozet bir kutu. Çakışanı elemek için. */
type Box = { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h

export default function Globe(props: GlobeProps) {
  const {
    countries, subFeatures, fills, childFills, drillCode, selectedCode,
    onSelect, onClearFocus, cameraTarget, priceCountryCents, priceAdmin1Cents, paused = false,
  } = props

  const [rotation, setRotation] = useState<Rotation>([-14, -38, 0])
  const [scale, setScale] = useState(350)
  const [dragging, setDragging] = useState(false)
  // Dar/kısa ekranda küre kırpılmak yerine tamamı görünür ve üste hizalanır
  // (alt tarafı bottom-sheet kapatıyor).
  const [compact, setCompact] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const lastInteract = useRef<number>(Date.now())
  const drag = useRef<{
    x: number; y: number; rot: Rotation; moved: number
    code: string | null; kind: 'country' | 'admin1' | null
  } | null>(null)
  const inDrillRef = useRef(false)
  const drillCodeRef = useRef<string | null>(null)
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  // Sürükleme sırasında kare başına tek güncelleme.
  const dragRaf = useRef<number | null>(null)
  const pendingRot = useRef<Rotation | null>(null)
  const anim = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px), (max-height: 640px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const projection = useMemo(
    () =>
      geoOrthographic()
        // Dar ekranda küre biraz büyütülür ama merkezde kalır; alt panel
        // varsayılan olarak kapalı açıldığı için küre tam görünür.
        .scale(scale * (compact ? 1.25 : 1))
        .translate([W / 2, H / 2])
        .rotate(rotation)
        .clipAngle(90),
    [scale, rotation, compact],
  )
  const path = useMemo(() => geoPath(projection), [projection])
  const graticule = useMemo(() => geoPath(projection)(geoGraticule10()) || '', [projection])

  const touch = () => { lastInteract.current = Date.now() }

  // -------------------------------------------------------------- kamera
  useEffect(() => {
    if (!cameraTarget) return
    const from: Rotation = [...rotation] as Rotation
    const fromScale = scale
    const to: Rotation = [-cameraTarget.lon, -cameraTarget.lat, 0]
    const dLon = ((to[0] - from[0] + 540) % 360) - 180
    const dLat = to[1] - from[1]
    const dScale = cameraTarget.scale - fromScale

    if (prefersReducedMotion()) {
      setRotation([from[0] + dLon, from[1] + dLat, 0])
      setScale(cameraTarget.scale)
      return
    }
    const start = performance.now()
    const dur = 620
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    if (anim.current) cancelAnimationFrame(anim.current)
    let done = false
    const land = () => {
      done = true
      setRotation([from[0] + dLon, from[1] + dLat, 0])
      setScale(cameraTarget.scale)
    }
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const e = ease(t)
      setRotation([from[0] + dLon * e, from[1] + dLat * e, 0])
      setScale(fromScale + dScale * e)
      if (t < 1) { anim.current = requestAnimationFrame(step) } else { anim.current = null; done = true }
    }
    anim.current = requestAnimationFrame(step)
    // rAF arka plandaki sekmede hiç tetiklenmez; o durumda kamera hedefe
    // asla ulaşmaz ve kullanıcı "yakınlaşmadı" diye görür. Güvenlik ağı:
    const fallback = setTimeout(() => {
      if (!done) { if (anim.current) cancelAnimationFrame(anim.current); anim.current = null; land() }
    }, dur + 180)
    touch()
    return () => {
      clearTimeout(fallback)
      if (anim.current) cancelAnimationFrame(anim.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTarget?.nonce])

  // ---------------------------------------------------------- boşta dönüş
  useEffect(() => {
    if (prefersReducedMotion()) return
    // Bir modal/arama açıkken hiç döngü kurmuyoruz. Aksi halde kullanıcı
    // yazarken 60 fps'te ~250 SVG path yeniden çiziliyor ve özellikle
    // mobilde girdi belirgin şekilde takılıyordu.
    if (paused) return
    let raf = 0
    let prev = performance.now()
    const tick = (now: number) => {
      const dt = (now - prev) / 1000
      prev = now
      const idle = Date.now() - lastInteract.current > IDLE_MS
      if (idle && !drag.current && !selectedCode && !drillCode && !anim.current) {
        setRotation((r) => [r[0] + SPIN_DEG_PER_SEC * dt, r[1], r[2]])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedCode, drillCode, paused])

  // -------------------------------------------------------------- sürükle
  //
  // Seçim neden onClick ile değil de burada yapılıyor:
  // sürüklemenin küre dışına taşabilmesi için pointer'ı SVG'ye capture
  // ediyoruz. Pointer capture olayları SVG'ye yeniden hedeflediği için
  // path'lerin kendi onClick'i hiç tetiklenmiyor. Bu yüzden basılan path'i
  // pointerdown'da kaydedip, pointerup'ta hareket eşiğinin altındaysa
  // (yani sürükleme değil dokunuşsa) seçimi biz tetikliyoruz.
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    touch()
    ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
    const el = e.target as SVGElement
    drag.current = {
      x: e.clientX, y: e.clientY, rot: rotation, moved: 0,
      code: el.dataset?.code ?? null,
      kind: (el.dataset?.kind as 'country' | 'admin1' | undefined) ?? null,
    }
    setDragging(true)
  }, [rotation])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Fare küre üzerindeyken otomatik dönüş durur. Bu satır olmadan kullanıcı
    // nişan alırken ülke kayıyor ve tıklama okyanusa düşüyor.
    touch()
    if (!drag.current) return
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const px = W / rect.width
    const dxRaw = e.clientX - drag.current.x
    const dyRaw = e.clientY - drag.current.y
    drag.current.moved = Math.max(drag.current.moved, Math.hypot(dxRaw, dyRaw))
    const k = 90 / scale
    const [l0, p0] = drag.current.rot
    pendingRot.current = [l0 + dxRaw * px * k, Math.max(-90, Math.min(90, p0 - dyRaw * px * k)), 0]
    if (dragRaf.current === null) {
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = null
        if (pendingRot.current) setRotation(pendingRot.current)
      })
    }
  }, [scale])

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (dragRaf.current !== null) { cancelAnimationFrame(dragRaf.current); dragRaf.current = null }
    if (pendingRot.current) { setRotation(pendingRot.current); pendingRot.current = null }
    if (!d) return
    try { (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId) } catch { /* zaten bırakılmış */ }
    drag.current = null
    setDragging(false)
    touch()
    if (e.type === 'pointercancel') return
    if (d.moved < 5) {
      if (d.code) {
        const kind = d.kind ?? 'country'
        // Bir ülkenin içindeyken BAŞKA bir ülkeye tıklamak odaktan çıkarır ve
        // dünya görünümüne döner. Eskiden hiçbir şey yapmıyordu; odaktan
        // çıkmanın tek yolu okyanusa basmaktı. Doğrudan o ülkeye geçmek de
        // denendi ama kullanıcı ülkeden ülkeye zıplayıp dünyaya hiç
        // dönemiyordu — çıkış her zaman bir üst seviyeye olmalı.
        if (inDrillRef.current && kind === 'country' && d.code !== drillCodeRef.current) {
          onClearFocus()
        } else {
          onSelect(d.code, kind)
        }
      } else {
        onClearFocus()
      }
    }
  }, [onClearFocus, onSelect])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      touch()
      setScale((s) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s * (e.deltaY > 0 ? 0.92 : 1.08))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) { pinch.current = { dist: dist(e.touches), scale }; drag.current = null; setDragging(false) }
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault()
        touch()
        setScale(Math.max(SCALE_MIN, Math.min(SCALE_MAX, pinch.current.scale * (dist(e.touches) / pinch.current.dist))))
      }
    }
    const end = () => { pinch.current = null }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
    }
  }, [scale])

  // --------------------------------------------------------------- render
  const center = useMemo<[number, number]>(() => [-rotation[0], -rotation[1]], [rotation])
  const visible = useCallback(
    (lon: number, lat: number) => geoDistance([lon, lat], center) < Math.PI / 2 - 0.06,
    [center],
  )

  type Drawn = {
    code: string; name: string; d: string; fill: Fill | undefined
    centroid: [number, number]; screen: [number, number] | null; box: number
  }

  const drawFeatures = useCallback(
    (fc: FeatureCollection<Geometry, TerrProps> | null | undefined, fillMap: Record<string, Fill>): Drawn[] => {
      if (!fc) return []
      const out: Drawn[] = []
      for (const f of fc.features as Feature<Geometry, TerrProps>[]) {
        const code = f.properties?.code
        if (!code) continue
        const d = path(f)
        if (!d) continue
        const centroid = geoCentroid(f) as [number, number]
        const [[x0, y0], [x1, y1]] = pathBounds(d)
        out.push({
          code, name: f.properties.name, d, fill: fillMap[code], centroid,
          screen: visible(centroid[0], centroid[1]) ? projection(centroid) : null,
          box: (x1 - x0) * (y1 - y0),
        })
      }
      return out
    },
    [path, projection, visible],
  )

  const countryShapes = useMemo(() => drawFeatures(countries, fills), [countries, fills, drawFeatures])
  const childShapes = useMemo(() => drawFeatures(subFeatures, childFills), [subFeatures, childFills, drawFeatures])

  const inDrill = !!drillCode && childShapes.length > 0
  inDrillRef.current = inDrill
  drillCodeRef.current = drillCode

  /**
   * Etiket ve marka rozetleri — çakışma çözümüyle.
   *
   * Önceden her görünen bölge etiket alıyordu ve 81 il yan yana gelince
   * isimler üst üste biniyordu. Şimdi adaylar ekranda kapladıkları alana
   * göre sıralanıp sırayla yerleştiriliyor; daha önce yerleşmiş bir kutuyla
   * çakışan aday atlanıyor. Marka rozetleri önce yerleşir (reklam yerleşimi
   * ürünün asıl çıktısı; isim etiketinden önceliklidir).
   */
  const annotations = useMemo(() => {
    const src = inDrill ? childShapes : countryShapes
    const priceCents = inDrill ? priceAdmin1Cents : priceCountryCents
    // Dar ekranda SVG küçülerek sığdığı için etiketler okunmaz hale geliyordu.
    // Rozet ve yazıları büyütüyoruz; çakışma kutuları da bu ölçekle hesaplanır
    // ki eleme doğru kalsın. Büyüyen etiketler kalabalık yapmasın diye aynı
    // anda eşiği yükseltip yalnız önemli bölgeleri etiketliyoruz.
    const ls = compact ? 1.9 : 1
    const minBox = (inDrill ? 150 : 620) * (compact ? 3.4 : 1)

    const placed: Box[] = []
    const pills: Array<{ code: string; iconKey: string; name: string; x: number; y: number; w: number; compact: boolean }> = []
    const labels: Array<{ code: string; name: string; x: number; y: number; price: boolean }> = []
    const fits = (b: Box) => !placed.some((p) => overlaps(b, p))

    const candidates = src
      .filter((s) => s.screen && s.box >= minBox)
      .sort((a, b) => b.box - a.box)

    // 1) Sahipli bölgeler: marka hapı (ikon + alan adı) — reklam birimi gibi okunur.
    //
    // Kademeli küçülme: uzun bir marka adı komşu illerin etiketini tamamen
    // yutuyordu. Önce tam ad, sığmazsa kısaltılmış ad, o da sığmazsa yalnız
    // ikon denenir. Böylece sahiplik bilgisi hiçbir zaman tamamen kaybolmaz.
    for (const s of candidates) {
      const key = s.fill?.leaderKey
      if (!key) continue
      const full = shortLabel(key, inDrill ? 14 : 18)
      const tiny = shortLabel(key, 7)
      const variants: Array<{ name: string; w: number; compact: boolean }> = [
        { name: full, w: 26 + full.length * 5.5, compact: false },
        { name: tiny, w: 26 + tiny.length * 5.5, compact: false },
        { name: '', w: 20, compact: true },
      ]
      const chosen = variants.find((v) => fits({ x: s.screen![0], y: s.screen![1], w: (v.w + 4) * ls, h: 22 * ls }))
      if (!chosen) continue
      placed.push({ x: s.screen![0], y: s.screen![1], w: (chosen.w + 4) * ls, h: 22 * ls })
      pills.push({ code: s.code, iconKey: key, name: chosen.name, x: s.screen![0], y: s.screen![1], w: chosen.w, compact: chosen.compact })
    }

    // 2) Boş bölgeler: isim + fiyat etiketi ("burası satılık" hissi).
    //    Tam ad sığmazsa kısaltılmışı denenir; ancak o da sığmazsa atlanır.
    for (const s of candidates) {
      if (s.fill?.leaderKey) continue
      const full = s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name
      const short = s.name.length > 8 ? s.name.slice(0, 7) + '…' : s.name
      const chosen = [full, short].find((n) =>
        fits({ x: s.screen![0], y: s.screen![1], w: (n.length * 5.6 + 10) * ls, h: 20 * ls }),
      )
      if (!chosen) continue
      placed.push({ x: s.screen![0], y: s.screen![1], w: (chosen.length * 5.6 + 10) * ls, h: 20 * ls })
      // Fiyat etiketi yalnız gerçekten geniş bölgelerde; küçükte kalabalık yapar.
      labels.push({ code: s.code, name: chosen, x: s.screen![0], y: s.screen![1], price: s.box > minBox * 3.2 })
    }

    return { pills, labels, priceCents, ls }
  }, [inDrill, childShapes, countryShapes, priceAdmin1Cents, priceCountryCents, compact])

  const spherePath = useMemo(() => path({ type: 'Sphere' }) || '', [path])

  return (
    <div className="globe-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio={compact ? 'xMidYMid meet' : 'xMidYMid slice'}
        className={dragging ? 'dragging' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label="Interactive globe of ad placements. To pick a territory with the keyboard, use the territory search."
      >
        <defs>
          <radialGradient id="ocean" cx="38%" cy="32%">
            <stop offset="0%" stopColor="var(--ocean-1)" />
            <stop offset="55%" stopColor="var(--ocean-2)" />
            <stop offset="100%" stopColor="var(--ocean-3)" />
          </radialGradient>
          <filter id="globeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#1f2b3e" floodOpacity="0.16" />
          </filter>
          <filter id="pillShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#1f2b3e" floodOpacity="0.28" />
          </filter>
        </defs>

        <path d={spherePath} fill="url(#ocean)" filter={compact ? undefined : "url(#globeShadow)"} />
        <path d={graticule} fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.6" />

        <g>
          {countryShapes.map((s) => {
            const isDrilled = s.code === drillCode
            const f = s.fill
            return (
              <path
                key={s.code}
                d={s.d}
                className={`terr clickable${inDrill && !isDrilled ? ' terr-bg' : ''}`}
                fill={isDrilled && inDrill ? '#eef3f8' : f?.color || 'var(--land)'}
                stroke={f ? '#ffffff' : 'var(--land-stroke)'}
                strokeWidth={f ? 1.1 : 0.55}
                opacity={inDrill && !isDrilled ? 0.4 : 1}
                data-code={s.code}
                data-kind="country"
              >
                <title>{`${s.name} — ${f ? `${f.bidders} advertiser(s)` : 'available'}`}</title>
              </path>
            )
          })}
        </g>

        {inDrill && (
          <g>
            {childShapes.map((s) => {
              const f = s.fill
              const isSel = s.code === selectedCode
              return (
                <path
                  key={s.code}
                  d={s.d}
                  className="terr clickable"
                  fill={f?.color || '#e9eef5'}
                  stroke={isSel ? 'var(--ink)' : '#ffffff'}
                  strokeWidth={isSel ? 2.2 : 0.9}
                  data-code={s.code}
                  data-kind="admin1"
                >
                  <title>{`${s.name} — ${f ? `${f.bidders} advertiser(s)` : 'available'}`}</title>
                </path>
              )
            })}
          </g>
        )}

        {!inDrill && selectedCode && (
          <g>
            {countryShapes.filter((s) => s.code === selectedCode).map((s) => (
              <path key="sel" d={s.d} fill="none" stroke="var(--ink)" strokeWidth="2.2" pointerEvents="none" />
            ))}
          </g>
        )}

        {/* Boş bölge: isim + fiyat etiketi */}
        <g pointerEvents="none">
          {annotations.labels.map((l) => (
            <g key={`lb-${l.code}`} transform={`translate(${l.x}, ${l.y}) scale(${annotations.ls})`}>
              <text className="terr-label" x={0} y={l.price ? -4 : 0} textAnchor="middle">{l.name}</text>
              {l.price && (
                <g transform="translate(0, 9)">
                  <rect x={-16} y={-7} width={32} height={14} rx={7} fill="#ffffff" fillOpacity="0.92" stroke="var(--land-stroke)" strokeWidth="0.6" />
                  <text className="price-tag" x={0} y={0} textAnchor="middle" dominantBaseline="central">
                    {`$${annotations.priceCents / 100}`}
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>

        {/* Sahipli bölge: marka hapı — haritadaki reklam birimi */}
        <g pointerEvents="none">
          {annotations.pills.map((p) => (
            <g
              key={`pill-${p.code}`}
              transform={`translate(${p.x}, ${p.y}) scale(${annotations.ls}) translate(${-p.w / 2}, -10)`}
              filter={compact ? undefined : "url(#pillShadow)"}
            >
              <rect
                width={p.w} height={20} rx={10} fill="#ffffff"
                stroke={compact ? "rgba(31,43,62,0.35)" : "none"} strokeWidth={compact ? 0.7 : 0}
              />
              <image
                href={`/api/icon?key=${encodeURIComponent(p.iconKey)}`}
                x={3} y={3} width={14} height={14} clipPath="inset(0 round 4px)"
              />
              {!p.compact && <text className="pill-text" x={21} y={10} dominantBaseline="central">{p.name}</text>}
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

/** Marka hapında gösterilecek kısa etiket: alan adı ya da @handle. */
function shortLabel(key: string, max = 18): string {
  let s = key
  if (s.includes('/')) {
    const [host, ...rest] = s.split('/')
    s = host.startsWith('x.com') || host.startsWith('instagram') ? `@${rest[0]}` : rest.join('/')
  }
  s = s.replace(/^www\./, '')
  // .com/.io gibi uzantıyı atmak ada yer açar; marka yine tanınır.
  if (s.length > max) s = s.replace(/\.(com|io|app|dev|co|net|org|ai|sh)$/, '')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Path 'd' string'inden kaba bounding box — etiket gösterme kararı için. */
function pathBounds(d: string): [[number, number], [number, number]] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const re = /(-?\d+(?:\.\d+)?)[, ](-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const x = +m[1], y = +m[2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return [[0, 0], [0, 0]]
  return [[minX, minY], [maxX, maxY]]
}
