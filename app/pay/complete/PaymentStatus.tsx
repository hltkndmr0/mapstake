'use client'

import { useEffect, useState } from 'react'

type Status = 'created' | 'paid' | 'cancelled' | 'expired' | 'missing' | 'timeout' | 'return_error'

export default function PaymentStatus({ intentId, initialStatus, territoryCode }: {
  intentId: string
  initialStatus: Status
  territoryCode: string
}) {
  const [status, setStatus] = useState<Status>(initialStatus)

  useEffect(() => {
    if (
      status === 'paid' || status === 'cancelled' || status === 'expired' ||
      status === 'missing' || status === 'return_error'
    ) return
    let stopped = false
    let attempts = 0

    const check = async () => {
      try {
        const response = await fetch(`/api/checkout/status?intent=${encodeURIComponent(intentId)}`, {
          cache: 'no-store',
        })
        const data = await response.json()
        if (stopped) return
        if (response.ok && data.status === 'paid') {
          setStatus('paid')
          window.setTimeout(() => {
            window.location.assign(`/?payment=${encodeURIComponent(intentId)}&t=${encodeURIComponent(territoryCode)}`)
          }, 700)
          return
        }
        if (response.ok && (data.status === 'cancelled' || data.status === 'expired')) {
          setStatus(data.status)
          return
        }
      } catch { /* webhook gecikiyorsa tekrar dene */ }

      attempts += 1
      if (attempts >= 30) { setStatus('timeout'); return }
      window.setTimeout(check, 2000)
    }

    check()
    return () => { stopped = true }
  }, [intentId, status, territoryCode])

  if (status === 'paid') {
    return <p className="lead" role="status">Payment confirmed. Your placement is live — taking you back to the map…</p>
  }
  if (status === 'return_error') {
    return <p className="lead" role="alert">The payment was not completed. Nothing was added to the map.</p>
  }
  if (status === 'cancelled' || status === 'expired' || status === 'missing') {
    return <p className="lead" role="alert">This checkout is no longer active. Nothing was added to the map.</p>
  }
  if (status === 'timeout') {
    return (
      <>
        <p className="lead" role="status">Whop is still confirming the payment. Your placement will appear automatically when the signed confirmation arrives.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Check again</button>
      </>
    )
  }
  return (
    <p className="lead" role="status">
      Payment submitted. Waiting for Whop&apos;s signed confirmation…
    </p>
  )
}
