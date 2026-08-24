'use client'

import { useState } from 'react'

export default function MockPay({ intentId, territoryCode, alreadyPaid }: {
  intentId: string; territoryCode: string; alreadyPaid: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(alreadyPaid ? 'This checkout has already been paid.' : null)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  async function pay(eventId?: string) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId, eventId }),
      })
      const d = await r.json()
      if (!r.ok) { setMsg(d.error || 'Could not process payment.'); return }
      setLastEvent(d.eventId)
      if (d.duplicate) { setMsg('That event was already processed — the placement was not written twice.'); return }
      window.location.href = `/?paid=1&t=${encodeURIComponent(territoryCode)}`
    } catch {
      setMsg('Network error.')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => pay()} disabled={busy}>
          {busy ? 'Processing…' : 'Confirm payment'}
        </button>
        <a className="btn btn-ghost" href="/">Cancel</a>
      </div>

      {/* Idempotency'yi gözle görülür biçimde test edebilmek için. */}
      {lastEvent && (
        <p style={{ marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => pay(lastEvent)} disabled={busy}>
            Replay the same event (idempotency test)
          </button>
        </p>
      )}

      {msg && <p className="note" style={{ marginTop: 12, fontWeight: 700 }} role="status">{msg}</p>}
    </div>
  )
}
