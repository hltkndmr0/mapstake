import { ImageResponse } from 'next/og'
import { BRAND, PRICING, formatMoney } from '@/lib/brand'
import { boardTotals } from '@/lib/board'

export const alt = `${BRAND.name} — ${BRAND.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'
export const revalidate = 300

export default async function Image() {
  // Sayaçlar okunamazsa kart yine üretilir; paylaşımın kırılmaması önemli.
  const totals = await boardTotals().catch(() => null)

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', background: '#080d18', color: '#f2f6fd',
        padding: '64px 72px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        <div style={{
          position: 'absolute', right: -260, top: -120, width: 760, height: 760,
          borderRadius: 760, background: 'rgba(255,201,60,0.07)', display: 'flex',
        }} />
        <div style={{
          position: 'absolute', right: -190, top: -40, width: 600, height: 600,
          borderRadius: 600, border: '2px solid rgba(255,255,255,0.10)', display: 'flex',
        }} />

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 16, height: 16, borderRadius: 5, background: '#ffc93c', display: 'flex' }} />
          <div style={{
            marginLeft: 14, fontSize: 26, fontWeight: 700, letterSpacing: 2, display: 'flex',
          }}>{BRAND.name.toUpperCase()}</div>
        </div>

        <div style={{
          display: 'flex', marginTop: 30, fontSize: 76, fontWeight: 800,
          lineHeight: 1.08, letterSpacing: -2, maxWidth: 880,
        }}>{BRAND.tagline}</div>

        <div style={{
          display: 'flex', marginTop: 22, fontSize: 30, color: '#97a6c0', maxWidth: 780, lineHeight: 1.4,
        }}>{BRAND.pitch}</div>

        <div style={{ display: 'flex', marginTop: 40, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, color: '#97a6c0' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#ffc93c', display: 'flex' }} />
            <div style={{ display: 'flex', marginLeft: 12 }}>
              241 countries from {formatMoney(PRICING.countryFloorCents)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, color: '#97a6c0', marginLeft: 44 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#45d483', display: 'flex' }} />
            <div style={{ display: 'flex', marginLeft: 12 }}>
              4,549 states from {formatMoney(PRICING.admin1FloorCents)}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginTop: 'auto', paddingTop: 30,
        }}>
          <div style={{ display: 'flex', fontSize: 21, color: '#6d7d99', maxWidth: 620 }}>
            {BRAND.legalNote}
          </div>
          {totals ? (
            <div style={{ display: 'flex', fontSize: 26, color: '#97a6c0' }}>
              <div style={{ display: 'flex', color: '#f2f6fd', fontWeight: 700 }}>
                {totals.activeTerritories}
              </div>
              <div style={{ display: 'flex', marginLeft: 8 }}>slots taken</div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    size,
  )
}
