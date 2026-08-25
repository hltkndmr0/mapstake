import { getIntentStatus } from '@/lib/ranking'
import PaymentStatus from './PaymentStatus'

export const dynamic = 'force-dynamic'

export default async function PaymentCompletePage({ searchParams }: {
  searchParams: Promise<{ intent?: string; t?: string; status?: string }>
}) {
  const params = await searchParams
  const intent = params.intent ? await getIntentStatus(params.intent) : undefined
  const initialStatus = params.status === 'error'
    ? 'return_error'
    : intent?.status === 'paid' || intent?.status === 'cancelled' || intent?.status === 'expired'
      ? intent.status
      : intent ? 'created' : 'missing'

  return (
    <main className="doc" style={{ maxWidth: 560 }}>
      <a className="back" href="/">← Back to the map</a>
      <div className="chip" style={{ marginBottom: 14 }}>Secure checkout · Whop</div>
      <h1>Confirming your placement</h1>
      {params.intent ? (
        <PaymentStatus
          intentId={params.intent}
          initialStatus={initialStatus}
          territoryCode={intent?.territoryCode ?? params.t ?? ''}
        />
      ) : (
        <p className="lead" role="alert">This payment return link is incomplete.</p>
      )}
      <p className="note" style={{ marginTop: 20 }}>
        Returning from checkout is not treated as proof of payment. Mapstake activates the
        placement only after Whop&apos;s signature-verified webhook reaches our server.
      </p>
    </main>
  )
}
