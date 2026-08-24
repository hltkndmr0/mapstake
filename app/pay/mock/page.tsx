import { q1 } from '@/lib/db'
import MockPay from './MockPay'
import { formatMoney } from '@/lib/brand'

export const dynamic = 'force-dynamic'

/**
 * Gerçek sağlayıcının hosted checkout'unun yerini tutan geçici sayfa.
 * Ödeme sağlayıcısı seçilince bu klasör tamamen silinir.
 */
export default async function MockPayPage({ searchParams }: { searchParams: Promise<{ intent?: string; t?: string }> }) {
  const sp = await searchParams
  const intentId = sp.intent

  const intent = intentId
    ? await q1<{
        id: string; display_url: string; amount_cents: number; existing_total_cents: number
        status: string; territory_name: string; territory_code: string; kind: string
      }>(
        `SELECT i.*, t.name AS territory_name, t.code AS territory_code, t.kind
           FROM intents i JOIN territories t ON t.id = i.territory_id
          WHERE i.id = $1`,
        [intentId],
      )
    : undefined

  if (!intent) {
    return (
      <main className="doc">
        <a className="back" href="/">← Back to the map</a>
        <h1>Checkout not found</h1>
        <p className="lead">This payment link is invalid or has expired.</p>
      </main>
    )
  }

  return (
    <main className="doc" style={{ maxWidth: 520 }}>
      <a className="back" href="/">← Back to the map</a>
      <div className="chip warn" style={{ marginBottom: 14 }}>Placeholder checkout</div>
      <h1>Confirm your placement</h1>
      <p className="lead">
        No payment provider is connected yet, so checkout is simulated here. No card details
        are requested and nothing is charged.
      </p>

      <div className="quote-box" style={{ fontSize: 15 }}>
        <div className="quote-line"><span className="k">Territory</span><span>{intent.territory_name}</span></div>
        <div className="quote-line"><span className="k">Advertiser</span><span>{intent.display_url}</span></div>
        {intent.existing_total_cents > 0 && (
          <div className="quote-line"><span className="k">Current total</span><span>{formatMoney(intent.existing_total_cents)}</span></div>
        )}
        <div className="quote-line"><span className="k">This payment</span><span>{formatMoney(intent.amount_cents)}</span></div>
        <div className="quote-line total">
          <span>New total</span>
          <span>{formatMoney(intent.existing_total_cents + intent.amount_cents)}</span>
        </div>
      </div>

      <MockPay intentId={intent.id} territoryCode={intent.territory_code} alreadyPaid={intent.status === 'paid'} />

      <p className="note" style={{ marginTop: 22 }}>
        In production this step is the provider&apos;s own checkout page, and the placement is
        only written when a signature-verified webhook arrives — returning to this page is
        never treated as proof of payment.
      </p>
    </main>
  )
}
