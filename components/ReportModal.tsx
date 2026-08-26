'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Category } from '@/lib/categories'

export type ReportTarget = {
  territoryCode: string
  territoryName: string
  advertiserKey: string
  displayUrl: string
  category: string
}

/**
 * "Bu ilan yanlış kategoride" bildirimi.
 *
 * Bildirim hiçbir şeyi anında değiştirmez ve kullanıcıya da böyle söylenir.
 * Otomatik taşıma, bir rakibi listeden düşürmek için kötüye kullanılabilirdi;
 * karar operatörde. Beklentiyi baştan doğru kurmak, "bildirdim ama bir şey
 * olmadı" şikâyetini baştan siler.
 */
export default function ReportModal({
  target, categories, onClose, onDone,
}: {
  target: ReportTarget
  categories: Category[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [suggested, setSuggested] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const reasonId = useId()

  const current = categories.find((c) => c.slug === target.category)

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement
    firstRef.current?.focus()
    return () => restoreFocus.current?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: target.territoryCode,
          key: target.advertiserKey,
          category: target.category,
          suggested,
          reason: reason.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not send the report.'); return }
      onDone('Thanks — a moderator will review this listing.')
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }, [busy, onDone, reason, suggested, target])

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>Report a wrong category</h2>
            <p className="note" style={{ margin: '4px 0 0' }}>
              <strong>{target.displayUrl}</strong> is listed under{' '}
              {current ? `${current.icon} ${current.name}` : target.category} in {target.territoryName}.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Where does it belong? <span className="note">(optional)</span></label>
            <div className="cat-picker" role="radiogroup" aria-label="Suggested category">
              {categories
                .filter((c) => c.slug !== target.category)
                .map((c, i) => (
                  <button
                    key={c.slug}
                    ref={i === 0 ? firstRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={suggested === c.slug}
                    className={`cat-chip sm${suggested === c.slug ? ' on' : ''}`}
                    style={{ '--cat': c.color } as React.CSSProperties}
                    onClick={() => setSuggested(suggested === c.slug ? null : c.slug)}
                  >
                    <span className="cat-icon" aria-hidden="true">{c.icon}</span>
                    <span className="cat-name">{c.name}</span>
                  </button>
                ))}
            </div>
            <p className="help">
              Not sure? Leave it blank — the report still counts.
            </p>
          </div>

          <div className="field">
            <label htmlFor={reasonId}>Anything to add? <span className="note">(optional)</span></label>
            <textarea
              id={reasonId}
              rows={2}
              maxLength={280}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="It sells car insurance, not software."
            />
          </div>

          {error ? <p className="err" role="alert">{error}</p> : null}

          <p className="note">
            Reports don&apos;t change the map on their own — a moderator reviews them.
            Paid placements are never deleted by a report; only the category can move.
          </p>
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
