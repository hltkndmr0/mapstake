import type { Metadata } from 'next'
import { BRAND, PRICING, formatMoney } from '@/lib/brand'

export const metadata: Metadata = { title: `How it works — ${BRAND.name}`, alternates: { canonical: '/rules' } }

// Fiyatlar metne gömülmüyor, PRICING'den geliyor. Orijinaldeki
// "kurallarda $5 yazıyor ama uygulama $2 alıyor" çelişkisi böyle önleniyor.
export default function Rules() {
  return (
    <main className="doc">
      <a className="back" href="/">← Back to the map</a>
      <h1>How it works</h1>
      <p className="lead">{BRAND.legalNote}</p>

      <h2>What you are buying</h2>
      <ul>
        <li>An ad placement for your brand in one territory.</li>
        <li>What you pay is <strong>added to your running total</strong> in that territory.</li>
        <li>Ranking is by total spend — the highest total sits at #1.</li>
        <li>Permanent #1 is not for sale; another advertiser can outbid you.</li>
      </ul>

      <h2>Countries and states</h2>
      <ul>
        <li>Every country has its own ranking.</li>
        <li>In countries with states or provinces, <strong>each one is a separate ad slot</strong> with its own ranking.</li>
        <li>Spend on a state does not count toward the country ranking — the two inventories are independent.</li>
        <li>A country page shows how many of its states are sold, for information only.</li>
      </ul>

      <h2>Pricing</h2>
      <ul>
        <li>New country placement: <strong>{formatMoney(PRICING.countryFloorCents)}</strong></li>
        <li>New state or province placement: <strong>{formatMoney(PRICING.admin1FloorCents)}</strong></li>
        <li>Topping up a placement you already hold: <strong>{formatMoney(PRICING.topUpFloorCents)}</strong></li>
        <li>To pass the leader you need at least <strong>{formatMoney(PRICING.outbidStepCents)}</strong> more than their total.</li>
        <li>Whole dollars only. The price is always computed on the server.</li>
      </ul>

      <h2>Ranking and ties</h2>
      <ul>
        <li>Sorted by total spend, highest first.</li>
        <li>On a tie, whoever <strong>reached that total first</strong> stays ahead.</li>
        <li>If you already hold a placement you only pay the difference — your earlier spend still counts.</li>
        <li>Your rank can change while you are checking out, if someone else pays first.</li>
      </ul>

      <h2>Identity and links</h2>
      <ul>
        <li>There are no accounts. Your identity is the normalised link you submit.</li>
        <li>Product URLs collapse to the domain; path, query and fragment are dropped.</li>
        <li>Supported social profiles: X, Instagram, GitHub and YouTube channels.</li>
        <li>Chat/invite links and URL shorteners are rejected.</li>
      </ul>

      <h2>Moderation</h2>
      <ul>
        <li>Illegal content, scams, malware, impersonation and hate content are not allowed.</li>
        <li>Placements that break these rules can be removed without refund.</li>
        <li>Report something: <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a></li>
      </ul>

      <h2>Payment</h2>
      <ul>
        <li>No payment provider is connected yet — nothing is being charged.</li>
        <li>Refund, invoicing and tax terms will be stated here once one is connected.</li>
        <li>Statutory consumer rights are not affected.</li>
      </ul>
    </main>
  )
}
