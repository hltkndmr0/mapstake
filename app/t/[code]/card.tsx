import { ImageResponse } from 'next/og'
import { BRAND, formatMoney } from '@/lib/brand'
import type { ShareView } from './data'

/**
 * Paylaşım kartı — iki route'un ortak çizeri.
 *
 * /t/<kod> ve /t/<kod>/<kategori> aynı görseli üretir; tek fark kartın
 * kategori şeridi ve kimin lider gösterildiği. Kartın kendisi tek yerde
 * durmalı, yoksa iki dosyadan biri güncellenmeden kalır.
 *
 * Emoji BİLEREK yok: satori emojiyi ancak dışarıdan (twemoji CDN) çekerek
 * çizebiliyor. Kart üretimi bir crawler isteğinin içinde koştuğu için
 * dış bağımlılık eklemek kartı sessizce boş bırakma riski demek. Kategori
 * kimliği renkli nokta + isimle veriliyor.
 */
const SIZE = { width: 1200, height: 630 }

const C = {
  bg: '#080d18',
  ink: '#f2f6fd',
  muted: '#97a6c0',
  dim: '#6d7d99',
  accent: '#ffc93c',
  live: '#45d483',
  line: 'rgba(255,255,255,0.10)',
  card: '#111a2c',
}

/** Uzun bölge adları kartı taşırmasın diye kaba bir ölçek. */
function titleSize(name: string): number {
  if (name.length > 34) return 54
  if (name.length > 24) return 68
  if (name.length > 16) return 84
  return 96
}

export function renderShareCard(view: ShareView | null) {
  const name = view?.name ?? 'Unknown territory'
  const leader = view?.entries[0] ?? null
  const runners = view?.entries.slice(1, 3) ?? []
  const kindLabel = view?.kind === 'admin1'
    ? (view.parentName ? `STATE · ${view.parentName.toUpperCase()}` : 'STATE')
    : 'COUNTRY'
  const cat = view?.category ?? null

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, color: C.ink, padding: '56px 64px', position: 'relative',
        fontFamily: 'sans-serif',
      }}>
        {/* Küreyi çağrıştıran, sağdan taşan yumuşak disk. */}
        <div style={{
          position: 'absolute', right: -220, top: -140, width: 720, height: 720,
          borderRadius: 720, background: 'rgba(255,201,60,0.07)', display: 'flex',
        }} />
        <div style={{
          position: 'absolute', right: -150, top: -60, width: 560, height: 560,
          borderRadius: 560, border: `2px solid ${C.line}`, display: 'flex',
        }} />

        {/* Üst şerit: marka + bölge türü */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: C.accent, display: 'flex' }} />
            <div style={{
              marginLeft: 12, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: C.ink,
              display: 'flex',
            }}>{BRAND.name.toUpperCase()}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {cat ? (
              <div style={{
                display: 'flex', alignItems: 'center', marginRight: 12,
                fontSize: 19, letterSpacing: 3, color: C.ink,
                border: `1px solid ${cat.color}`, borderRadius: 999, padding: '8px 18px',
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: 12, background: cat.color,
                  display: 'flex', marginRight: 12,
                }} />
                {cat.name.toUpperCase()}
              </div>
            ) : null}
            <div style={{
              fontSize: 19, letterSpacing: 3, color: C.dim, display: 'flex',
              border: `1px solid ${C.line}`, borderRadius: 999, padding: '8px 18px',
            }}>{kindLabel}</div>
          </div>
        </div>

        {/* Bölge adı */}
        <div style={{
          display: 'flex', marginTop: 34, fontSize: titleSize(name), fontWeight: 800,
          lineHeight: 1.05, letterSpacing: -2, maxWidth: 900,
        }}>{name}</div>

        {/* Lider ya da boşsa fiyat çağrısı */}
        {leader ? (
          <div style={{
            display: 'flex', flexDirection: 'column', marginTop: 30, padding: '24px 28px',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, maxWidth: 860,
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 52, height: 52, borderRadius: 12, background: C.accent,
                color: '#0b1120', fontSize: 26, fontWeight: 800,
              }}>1</div>
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20, flex: 1 }}>
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>
                  {leader.title || leader.displayUrl}
                </div>
                {leader.title ? (
                  <div style={{ display: 'flex', fontSize: 22, color: C.dim, marginTop: 4 }}>
                    {leader.displayUrl}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: C.accent }}>
                {formatMoney(leader.totalCents)}
              </div>
            </div>

            {runners.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
                {runners.map((r) => (
                  <div key={r.rank} style={{
                    display: 'flex', alignItems: 'center', marginTop: 10,
                    paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 24, color: C.muted,
                  }}>
                    <div style={{ display: 'flex', width: 42, color: C.dim }}>#{r.rank}</div>
                    <div style={{ display: 'flex', flex: 1 }}>{r.displayUrl}</div>
                    <div style={{ display: 'flex' }}>{formatMoney(r.totalCents)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', marginTop: 34, padding: '26px 30px',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, maxWidth: 700,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: C.live, display: 'flex' }} />
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, marginLeft: 16 }}>
              {cat ? `${cat.name} — from` : 'Available from'}
            </div>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: C.accent, marginLeft: 14 }}>
              {formatMoney(view?.floorCents ?? 500)}
            </div>
          </div>
        )}

        {/* Alt şerit: toplam + hukuki not */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginTop: 'auto', paddingTop: 28,
        }}>
          <div style={{ display: 'flex', fontSize: 22, color: C.dim, maxWidth: 620 }}>
            {BRAND.legalNote}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: C.muted }}>
            <div style={{ display: 'flex' }}>
              {view
                ? `${view.bidders} advertiser${view.bidders === 1 ? '' : 's'}${cat ? ' in this category' : ''}`
                : ''}
            </div>
            {view && view.bidders > 0 ? (
              <div style={{ display: 'flex', marginLeft: 16, color: C.ink, fontWeight: 700 }}>
                {formatMoney(view.totalCents)} total
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    SIZE,
  )
}
