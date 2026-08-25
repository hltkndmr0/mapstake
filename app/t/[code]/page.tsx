import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BRAND, formatMoney } from '@/lib/brand'
import { shareView } from './data'

export const revalidate = 60

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const view = await shareView(code)
  if (!view) return { title: `Territory not found — ${BRAND.name}` }

  const leader = view.entries[0]
  const where = view.parentName ? `${view.name}, ${view.parentName}` : view.name
  const title = leader
    ? `${leader.displayUrl} is #1 in ${where} — ${BRAND.name}`
    : `${where} is available from ${formatMoney(view.floorCents)} — ${BRAND.name}`
  const description = leader
    ? `${view.bidders} advertiser${view.bidders === 1 ? '' : 's'} competing in ${where}. ` +
      `Leader total ${formatMoney(leader.totalCents)}. ${BRAND.legalNote}`
    : `No advertiser has claimed ${where} yet. Placements start at ${formatMoney(view.floorCents)}. ${BRAND.legalNote}`

  return {
    title,
    description,
    alternates: { canonical: `/t/${view.code}` },
    openGraph: { title, description, type: 'website', siteName: BRAND.name, url: `/t/${view.code}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function TerritoryPage({ params }: Props) {
  const { code } = await params
  const view = await shareView(code)
  if (!view) notFound()

  const leader = view.entries[0]
  const where = view.parentName ? `${view.name}, ${view.parentName}` : view.name

  return (
    <main className="doc">
      <a className="back" href="/">← Back to the map</a>

      <p className="kicker" style={{ marginBottom: 10 }}>
        {view.kind === 'admin1' ? 'State / province' : 'Country'}
        {view.parentName ? ` · ${view.parentName}` : ''}
      </p>
      <h1>{view.name}</h1>

      {leader ? (
        <p className="lead">
          <strong>{leader.title || leader.displayUrl}</strong> holds #1 in {where} with{' '}
          <strong>{formatMoney(leader.totalCents)}</strong> in total spend
          {view.bidders > 1 ? `, ahead of ${view.bidders - 1} other advertiser${view.bidders > 2 ? 's' : ''}` : ''}.
        </p>
      ) : (
        <p className="lead">
          No advertiser has claimed {where} yet. Placements here start at{' '}
          <strong>{formatMoney(view.floorCents)}</strong>.
        </p>
      )}

      <p>
        <a className="btn btn-primary" href={`/?t=${encodeURIComponent(view.code)}`}>
          {leader ? 'Take #1 on the map' : `Claim ${view.name}`}
        </a>
      </p>

      {view.entries.length > 0 ? (
        <>
          <h2>Standings</h2>
          <table className="rank-table">
            <thead>
              <tr><th scope="col">#</th><th scope="col">Advertiser</th><th scope="col">Total spend</th></tr>
            </thead>
            <tbody>
              {view.entries.map((e) => (
                <tr key={e.rank}>
                  <td>{e.rank}</td>
                  <td>
                    <span className="rank-dot" style={{ background: e.color || 'var(--muted-dim)' }} />
                    {e.title ? <strong>{e.title}</strong> : null} {e.displayUrl}
                  </td>
                  <td>{formatMoney(e.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">
            Ranking is by cumulative spend. Ties are broken by who reached that total first.
            {' '}{BRAND.adDisclosure}
          </p>
        </>
      ) : null}

      <h2>How this works</h2>
      <ul>
        <li>Every country and every state is a separate ad slot — they compete independently.</li>
        <li>Your rank is your <strong>total</strong> spend, not your last payment. Payments accumulate.</li>
        <li>If you are overtaken you only pay the difference, never the full amount again.</li>
      </ul>

      <p className="fine">{BRAND.legalNote}</p>
    </main>
  )
}
