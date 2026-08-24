'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatMoney } from '@/lib/brand'
import type { BoardEntry } from './Stage'

type Result = {
  code: string; name: string; kind: 'country' | 'admin1'; subtype: string | null
  child_count: number; parent_code: string | null; parent_name: string | null
  bidders: number; pool: number
}

/**
 * Haritanın klavye ve ekran okuyucu alternatifi.
 *
 * Orijinal üründe ülke path'lerinin hiçbiri odaklanabilir değildi; yani
 * ürünün ana işlevi fare/dokunmatik olmadan hiç kullanılamıyordu.
 * Bu liste combobox deseniyle o açığı kapatır: yazarak ara, ok tuşlarıyla
 * gez, Enter ile seç.
 */
export default function TerritorySearch({ index, board, onClose, onPick }: {
  index: Array<{ code: string; name: string; admin1: number }>
  board: Record<string, BoardEntry>
  onClose: () => void
  onPick: (row: { code: string; kind: 'country' | 'admin1'; parentCode?: string | null }) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const listId = useId()
  const labelId = useId()

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement
    inputRef.current?.focus()
    return () => restoreFocus.current?.focus?.()
  }, [])

  // Boş aramada: dolu ülkeler + büyük ülkeler önerisi.
  useEffect(() => {
    if (q.trim().length === 0) {
      const seeded = index
        .map((c) => ({
          code: c.code, name: c.name, kind: 'country' as const, subtype: null,
          child_count: c.admin1, parent_code: null, parent_name: null,
          bidders: board[c.code]?.bidders ?? 0, pool: board[c.code]?.totalCents ?? 0,
        }))
        .sort((a, b) => b.pool - a.pool || b.child_count - a.child_count)
        .slice(0, 25)
      setResults(seeded)
      setActive(0)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => { setResults(d.results || []); setActive(0) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 200)
    return () => { clearTimeout(id); ctrl.abort(); setLoading(false) }
  }, [q, index, board])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(results.length - 1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) onPick({ code: r.code, kind: r.kind, parentCode: r.parent_code })
    }
  }

  // Aktif öğeyi görünür tut (klavyeyle gezerken listeden çıkmasın).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card search-panel" role="dialog" aria-modal="true" aria-labelledby={labelId} id="territory-search">
        <div className="search-input-wrap">
          <label id={labelId} htmlFor="terr-q" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
            Find a slot — country, state or province
          </label>
          <input
            id="terr-q"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            placeholder="California, Bavaria, Istanbul…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            style={{
              width: '100%', padding: '11px 13px', border: '1px solid var(--line)',
              borderRadius: 10, font: 'inherit', fontSize: 16, background: '#fbfdff',
            }}
          />
        </div>

        <ul className="search-results" id={listId} role="listbox" aria-label="Territory results" ref={listRef}>
          {loading && results.length === 0 && (
            <li style={{ padding: 10 }}><div className="skeleton" style={{ height: 32 }} /></li>
          )}
          {!loading && results.length === 0 && (
            <li style={{ padding: '14px 12px' }} className="note">No matches.</li>
          )}
          {results.map((r, i) => (
            <li key={r.code} role="option" aria-selected={i === active} id={`${listId}-${i}`}>
              <button
                type="button"
                className="search-item"
                data-i={i}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick({ code: r.code, kind: r.kind, parentCode: r.parent_code })}
              >
                <span className="sub-swatch" style={{ background: board[r.code]?.leader?.color || 'var(--land)' }} />
                <span className="nm">
                  {r.name}
                  <span className="sub">
                    {' '}
                    {r.kind === 'admin1'
                      ? `${r.subtype || 'Region'} · ${r.parent_name ?? ''}`
                      : r.child_count > 0 ? `Country · ${r.child_count} states` : 'Country'}
                  </span>
                </span>
                <span className="rank-meta">
                  {r.bidders > 0 ? `${formatMoney(r.pool)} · ${r.bidders}` : 'open'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
