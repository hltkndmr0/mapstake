import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = { title: `About — ${BRAND.name}`, alternates: { canonical: '/about' } }

export default function About() {
  return (
    <main className="doc">
      <a className="back" href="/">← Back to the map</a>
      <h1>About</h1>
      <p className="lead">{BRAND.name} is a public advertising board where brands buy visibility on a world map.</p>

      <h2>Listings are submitted by users</h2>
      <ul>
        <li>Every link here was added by a user and is not verified by us.</li>
        <li>A listing is not an endorsement, verification or partnership.</li>
        <li>We are not responsible for the content of external sites.</li>
        <li>Brand names and logos are shown for identification only.</li>
      </ul>

      <h2>Map data</h2>
      <ul>
        <li>Borders are derived from Natural Earth data and are <strong>illustrative</strong>.</li>
        <li>No border shown here is a political statement.</li>
        <li>Administrative divisions change over time as countries reorganise them.</li>
      </ul>

      <h2>Contact</h2>
      <p>Takedowns, bug reports and complaints: <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a></p>
    </main>
  )
}
