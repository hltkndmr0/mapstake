'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BRAND, formatMoney } from '@/lib/brand'
import type { Detail } from './Stage'

type Mode = 'product' | 'social'

type Quote = {
  quoteId: string
  canonicalKey: string
  displayUrl: string
  existingTotalCents: number
  isTopUp: boolean
  floorCents: number
  suggestedAmountCents: number
  projectedTotalCents: number
  projectedRank: number
  leaderTotalCents: number
  requiredToLeadCents: number
}

export default function StakeModal({ detail, onClose, onPaid, prefill }: {
  detail: Detail
  onClose: () => void
  onPaid: (code: string) => void
  /** Ek satıştan gelindiğinde link/mod hazır gelsin. */
  prefill?: { url: string; mode: Mode } | null
}) {
  const t = detail.territory
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? 'product')
  const [url, setUrl] = useState(prefill?.url ?? '')
  // Ülkeyi de al: il/eyalet satın alırken sorulan ek satış.
  const [alsoCountry, setAlsoCountry] = useState(false)
  const [amount, setAmount] = useState<number>(Math.round(detail.floorCents / 100))
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  // Kullanıcı tutarı elle değiştirdiyse sunucunun önerisi onu ezmesin.
  const userEditedAmount = useRef(false)
  const lastKey = useRef<string | null>(null)

  const titleId = useId()
  const descId = useId()
  const urlId = useId()
  const amountId = useId()
  const urlErrId = useId()

  // --------------------------------------------------------- odak yönetimi
  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement
    firstFieldRef.current?.focus()
    return () => restoreFocus.current?.focus?.()
  }, [])

  // Focus trap: Tab modalın dışına çıkamaz.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------ canlı quote
  // Fiyatın otoritesi sunucu. Kullanıcı yazdıkça sunucuya sorup
  // "mevcut toplam + bu ödeme = yeni toplam" özetini gerçek veriyle gösteriyoruz.
  useEffect(() => {
    if (url.trim().length < 3) { setQuote(null); setError(null); return }
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const r = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          // Tutar GÖNDERİLMİYOR: sunucu tabanı ve mevcut toplamı döner,
          // yeni toplam/sıra istemcide hesaplanır. Böylece tutar alanını
          // değiştirmek ağ gidiş-dönüşü yaratmaz.
          body: JSON.stringify({ code: t.code, url, mode }),
        })
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Could not validate that URL.'); setQuote(null); return }
        setError(null)
        setQuote(data)

        // KRİTİK DÜZELTME: girilen link zaten bu bölgede varsa, gereken tutar
        // FARK kadardır. Orijinal ürün bu yeniden hesaplamayı yapmadığı için
        // kullanıcıyı gereğinden fazla ödemeye yönlendiriyordu.
        if (data.canonicalKey !== lastKey.current) {
          lastKey.current = data.canonicalKey
          userEditedAmount.current = false
          setAmount(Math.round(data.suggestedAmountCents / 100))
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('Network error.')
      }
    }, 500)
    return () => { clearTimeout(id); ctrl.abort() }
    // amount BİLEREK bağımlılık değil — bkz. yukarıdaki not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mode, t.code])

  const amountCents = Math.round(amount * 100)
  const floor = quote?.floorCents ?? detail.floorCents
  const belowFloor = amountCents < floor
  const projectedTotal = (quote?.existingTotalCents ?? 0) + amountCents

  const submit = useCallback(async () => {
    if (!quote || belowFloor || busy) return
    setBusy(true)
    try {
      // Paket seçiliyse ödeme ÜLKE için yapılır ve bu il pakete dahil edilir:
      // kullanıcı yalnız ülke bedelini öder, iki yerleşimi birden alır.
      const bundling = alsoCountry && !!detail.parentOffer
      const payload = bundling
        ? {
            code: detail.parentOffer!.code,
            url, mode,
            amountCents: detail.parentOffer!.requiredToLeadCents,
            bundleCode: t.code,
          }
        : { code: t.code, url, mode, amountCents }

      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not start checkout.'); return }

      sessionStorage.removeItem(`${BRAND.slug}.pendingUpsell`)
      window.location.assign(data.redirectUrl)
    } catch {
      setError('Could not start checkout.')
    } finally { setBusy(false) }
  }, [quote, belowFloor, busy, t.code, url, mode, amountCents, alsoCountry, detail.parentOffer])

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} ref={dialogRef}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>Advertise in {t.name}</h2>
            <p id={descId} className="note" style={{ margin: '4px 0 0' }}>
              {t.kind === 'admin1'
                ? `This ${(t.subtype || 'region').toLowerCase()} in ${t.parent?.name ?? ''} has its own ranking.`
                : detail.children
                  ? 'Country ranking is separate from its states.'
                  : "This country's own ranking."}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="tabs" role="tablist" aria-label="Link type">
            <button role="tab" aria-selected={mode === 'product'} className="tab"
              onClick={() => { setMode('product'); lastKey.current = null }}>
              Product URL
            </button>
            <button role="tab" aria-selected={mode === 'social'} className="tab"
              onClick={() => { setMode('social'); lastKey.current = null }}>
              Social profile
            </button>
          </div>

          <div className="field">
            <label htmlFor={urlId}>{mode === 'product' ? 'Product URL' : 'Profile URL'}</label>
            <input
              id={urlId}
              ref={firstFieldRef}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder={mode === 'product' ? 'yourbrand.com' : 'x.com/yourhandle'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? urlErrId : undefined}
            />
            {error
              ? <p className="err" id={urlErrId} role="alert">{error}</p>
              : <p className="help">
                  {mode === 'product'
                    ? 'URLs collapse to the domain — same domain means same advertiser.'
                    : 'X, Instagram, GitHub and YouTube profiles are supported.'}
                </p>}
          </div>

          <div className="field">
            <label htmlFor={amountId}>Your bid (USD)</label>
            <input
              id={amountId}
              type="number"
              min={Math.round(floor / 100)}
              step={1}
              value={amount}
              onChange={(e) => { userEditedAmount.current = true; setAmount(Math.max(0, Math.floor(+e.target.value || 0))) }}
              aria-describedby={`${amountId}-help`}
              aria-invalid={belowFloor}
            />
            <p className="help" id={`${amountId}-help`}>
              Minimum {formatMoney(floor)}
              {quote?.isTopUp && " (you're topping up an existing placement)"}
            </p>
          </div>

          {/* Ne aldığının tam özeti — ödemeden önce sürpriz kalmasın. */}
          <div className="quote-box" aria-live="polite">
            {quote ? (
              <>
                <div className="quote-line"><span className="k">Advertiser</span><span>{quote.displayUrl}</span></div>
                {quote.isTopUp && (
                  <div className="quote-line"><span className="k">Your current total</span><span>{formatMoney(quote.existingTotalCents)}</span></div>
                )}
                <div className="quote-line"><span className="k">This payment</span><span>{formatMoney(amountCents)}</span></div>
                {alsoCountry && detail.parentOffer ? (
                  <>
                    <div className="quote-line">
                      <span className="k">{detail.parentOffer.name} (national)</span>
                      <span>{formatMoney(detail.parentOffer.requiredToLeadCents)}</span>
                    </div>
                    <div className="quote-line">
                      <span className="k">{t.name} ({(t.subtype || 'state').toLowerCase()})</span>
                      <span>included</span>
                    </div>
                    <div className="quote-line total"><span>You pay</span><span>{formatMoney(detail.parentOffer.requiredToLeadCents)}</span></div>
                  </>
                ) : (
                  <div className="quote-line total"><span>Your new total</span><span>{formatMoney(projectedTotal)}</span></div>
                )}
                <div className="quote-line" style={{ marginTop: 8 }}>
                  <span className="k">Projected rank</span>
                  <span>#{estimateRank(quote, projectedTotal)}</span>
                </div>
                {quote.requiredToLeadCents > amountCents && (
                  <div className="quote-line">
                    <span className="k">To take #1</span>
                    <span>{formatMoney(quote.requiredToLeadCents)}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="note" style={{ margin: 0 }}>Enter a URL to see the full breakdown.</p>
            )}
          </div>

          {/* Ek satış: ülke ayrı bir envanter olduğu için bu ikinci bir alım. */}
          {detail.parentOffer && (
            <label className="addon">
              <input
                type="checkbox"
                checked={alsoCountry}
                onChange={(e) => setAlsoCountry(e.target.checked)}
              />
              <span className="addon-main">
                <span className="addon-title">
                  <span className="ad-tag">Bundle</span>
                  Take all of {detail.parentOffer.name} — {t.name} included
                </span>
                <span className="addon-desc">
                  {detail.parentOffer.leaderKey
                    ? `${detail.parentOffer.leaderKey} holds the national slot at ${formatMoney(detail.parentOffer.leaderTotalCents)}. `
                    : 'The national slot is still open. '}
                  You pay the national price only — this {(t.subtype || 'state').toLowerCase()} comes free with it.
                </span>
              </span>
              <span className="addon-price">
                {formatMoney(detail.parentOffer.requiredToLeadCents)}
                <span className="addon-was">was {formatMoney(detail.parentOffer.requiredToLeadCents + amountCents)}</span>
              </span>
            </label>
          )}

          <p className="note">
            {BRAND.legalNote} Your rank can change while you check out — what you buy is
            the amount being added to your total, not a guaranteed position.
          </p>
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={submit} disabled={!quote || belowFloor || busy}>
            {busy
              ? 'Redirecting…'
              : alsoCountry && detail.parentOffer
                ? `Continue · ${formatMoney(detail.parentOffer.requiredToLeadCents)} for both`
                : `Continue · ${formatMoney(amountCents)}`}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** İstemci yalnız tahmin gösterir; kesin sıra ödeme anında sunucuda hesaplanır. */
function estimateRank(q: Quote, projectedTotal: number): number {
  if (projectedTotal > q.leaderTotalCents) return 1
  return q.projectedRank
}
