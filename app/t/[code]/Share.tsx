import Flag from '@/components/Flag'
import { BRAND, formatMoney } from '@/lib/brand'
import { sharePath, shareScope, type ShareView } from './data'

/**
 * Paylaşım sayfasının gövdesi.
 *
 * İki route bunu kullanır: /t/<kod> (bütün kategoriler) ve /t/<kod>/<kategori>.
 * Ayrı ayrı yazılsaydı biri güncellenip diğeri geride kalırdı — kartla sayfanın
 * ayrışmaması bu ürünün açık kuralı.
 */
export default function Share({ view }: { view: ShareView }) {
  const leader = view.entries[0]
  const scope = shareScope(view)
  const cat = view.category
  // Haritaya dönüş kategoriyi de taşır: kart neyi gösterdiyse harita da onu
  // açsın, ziyaretçi filtreyi elle bulmak zorunda kalmasın.
  const mapHref = `/?t=${encodeURIComponent(view.code)}${cat ? `&cat=${cat.slug}` : ''}`

  return (
    <main className="doc">
      <a className="back" href="/">← Back to the map</a>

      <p className="kicker" style={{ marginBottom: 10 }}>
        {view.kind === 'admin1' ? 'State / province' : 'Country'}
        {view.parentName ? ` · ${view.parentName}` : ''}
        {cat ? ` · ${cat.icon} ${cat.name}` : ''}
      </p>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Alt birim kodu ('TR-34') da ülkenin bayrağına çözülür. */}
        <Flag code={view.code} size={34} />
        {view.name}
      </h1>

      {leader ? (
        <p className="lead">
          <strong>{leader.title || leader.displayUrl}</strong> holds #1 in {scope} with{' '}
          <strong>{formatMoney(leader.totalCents)}</strong> in total spend
          {view.bidders > 1 ? `, ahead of ${view.bidders - 1} other advertiser${view.bidders > 2 ? 's' : ''}` : ''}.
        </p>
      ) : (
        <p className="lead">
          {cat
            ? <>Nobody has claimed <strong>{cat.name}</strong> in {view.name} yet. </>
            : <>No advertiser has claimed {scope} yet. </>}
          Placements here start at <strong>{formatMoney(view.floorCents)}</strong>.
        </p>
      )}

      <p>
        <a className="btn btn-primary" href={mapHref}>
          {leader ? 'Take #1 on the map' : `Claim ${cat ? `${cat.name} in ${view.name}` : view.name}`}
        </a>
      </p>

      {view.entries.length > 0 ? (
        <>
          <h2>Standings{cat ? ` · ${cat.name}` : ''}</h2>
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

      {/* Kategori geçişi: her kategorinin kendi adresi ve kendi paylaşım
          kartı var. Boş olanlar da listede — satılık envanterin kendisi. */}
      <h2>Categories in {view.name}</h2>
      <div className="share-cats">
        <a className={`share-cat${cat ? '' : ' on'}`} href={sharePath(view.code)}>
          <span className="share-cat-icon" aria-hidden="true">🌐</span>
          <span className="share-cat-main">
            <span className="nm">All categories</span>
            <span className="am">combined ranking</span>
          </span>
        </a>
        {view.categories.map((c) => (
          <a
            key={c.slug}
            className={`share-cat${cat?.slug === c.slug ? ' on' : ''}${c.leaderUrl ? '' : ' open'}`}
            style={{ '--cat': c.color } as React.CSSProperties}
            href={sharePath(view.code, c.slug)}
          >
            <span className="share-cat-icon" aria-hidden="true">{c.icon}</span>
            <span className="share-cat-main">
              <span className="nm">{c.name}</span>
              <span className="am">
                {c.leaderUrl
                  ? `👑 ${c.leaderUrl} · ${formatMoney(c.totalCents)}`
                  : `open · from ${formatMoney(view.floorCents)}`}
              </span>
            </span>
          </a>
        ))}
      </div>

      <h2>How this works</h2>
      <ul>
        <li>Every country and every state is a separate ad slot — they compete independently.</li>
        <li>
          Each <strong>category</strong> is its own race: a software brand never has to
          outspend a car brand to be #1.
        </li>
        <li>Your rank is your <strong>total</strong> spend, not your last payment. Payments accumulate.</li>
        <li>If you are overtaken you only pay the difference, never the full amount again.</li>
      </ul>

      <p className="fine">{BRAND.legalNote}</p>
    </main>
  )
}
