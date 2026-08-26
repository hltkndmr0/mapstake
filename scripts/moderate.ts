/**
 * Moderasyon konsolu.
 *
 * Neden web arayüzü değil: yönetim ekranı yeni bir kimlik doğrulama yüzeyi,
 * yeni bir oturum modeli ve yeni bir saldırı alanı demek. Operatör tek kişi
 * ve zaten veritabanı adresine sahip; komut satırı hem daha az kod hem daha
 * az risk. Her işlem moderation_log'a yazılıyor, yani denetim kaydı yine var.
 *
 * Kullanım:
 *   npm run moderate -- reports
 *   npm run moderate -- move <placementId> <category>
 *   npm run moderate -- hide <advertiserKey>   [not]
 *   npm run moderate -- show <advertiserKey>
 *   npm run moderate -- dismiss <placementId>
 *   npm run moderate -- log [adet]
 */
import { q } from '../lib/db'
import { listCategories } from '../lib/categories'
import { dismissReports, openReports, recategorize, setAdvertiserStatus } from '../lib/moderation'

const actor = process.env.USER || process.env.LOGNAME || 'cli'
const [cmd, ...args] = process.argv.slice(2)

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

async function cmdReports(): Promise<void> {
  const rows = await openReports(50)
  if (rows.length === 0) {
    console.log('Açık bildirim yok.')
    return
  }
  console.log(`${rows.length} yerleşim için açık bildirim:\n`)
  for (const r of rows) {
    console.log(`  #${r.placementId}  ${r.advertiserKey}`)
    console.log(`     ${r.territoryName} (${r.territoryCode}) · şu an: ${r.currentCategory}`)
    console.log(
      `     ${r.reports} bildirim` +
      (r.suggestedCategory ? ` · öneri: ${r.suggestedCategory}` : ' · öneri yok') +
      (r.reason ? ` · "${r.reason}"` : ''),
    )
    console.log(`     taşımak için: npm run moderate -- move ${r.placementId} ${r.suggestedCategory ?? '<kategori>'}\n`)
  }
}

async function cmdMove(): Promise<void> {
  const id = Number(args[0])
  const category = args[1]
  if (!Number.isFinite(id) || !category) {
    console.error('Kullanım: move <placementId> <category>')
    process.exitCode = 1
    return
  }
  const res = await recategorize(id, category, actor)
  if (!res.ok) {
    console.error(`Hata: ${res.error}`)
    process.exitCode = 1
    return
  }
  console.log(
    res.merged
      ? `Taşındı ve mevcut yerleşimle BİRLEŞTİRİLDİ → ${category}, yeni toplam ${money(res.totalCents)}`
      : `Taşındı → ${category} (${money(res.totalCents)})`,
  )
}

async function cmdStatus(status: 'hidden' | 'approved'): Promise<void> {
  const key = args[0]
  if (!key) {
    console.error(`Kullanım: ${status === 'hidden' ? 'hide' : 'show'} <advertiserKey> [not]`)
    process.exitCode = 1
    return
  }
  const res = await setAdvertiserStatus(key, status, actor, args.slice(1).join(' ') || undefined)
  if (!res.ok) {
    console.error(`Hata: ${res.error}`)
    process.exitCode = 1
    return
  }
  console.log(
    status === 'hidden'
      ? `${key} gizlendi — haritadan, listeden ve karttan düştü.`
      : `${key} yeniden görünür.`,
  )
}

async function cmdDismiss(): Promise<void> {
  const id = Number(args[0])
  if (!Number.isFinite(id)) {
    console.error('Kullanım: dismiss <placementId>')
    process.exitCode = 1
    return
  }
  const n = await dismissReports(id, actor)
  console.log(`${n} bildirim kapatıldı.`)
}

async function cmdLog(): Promise<void> {
  const limit = Number(args[0]) || 20
  const rows = await q<{
    action: string; actor: string; detail: unknown; created_at: Date
    key: string | null
  }>(
    `SELECT m.action, m.actor, m.detail, m.created_at, a.canonical_key AS key
       FROM moderation_log m
       LEFT JOIN advertisers a ON a.id = m.advertiser_id
      ORDER BY m.created_at DESC LIMIT $1`,
    [limit],
  )
  if (rows.length === 0) {
    console.log('Denetim kaydı boş.')
    return
  }
  for (const r of rows) {
    const at = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  ${at}  ${r.actor.padEnd(12)} ${r.action.padEnd(18)} ${r.key ?? ''} ${JSON.stringify(r.detail)}`)
  }
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'reports': await cmdReports(); break
    case 'move': await cmdMove(); break
    case 'hide': await cmdStatus('hidden'); break
    case 'show': await cmdStatus('approved'); break
    case 'dismiss': await cmdDismiss(); break
    case 'log': await cmdLog(); break
    case 'categories': {
      for (const c of await listCategories()) console.log(`  ${c.slug.padEnd(12)} ${c.icon} ${c.name}`)
      break
    }
    default:
      console.log(`Komutlar:
  reports              açık bildirimleri listele
  move <id> <kategori> yerleşimi taşı (gerekirse birleştirir)
  hide <key> [not]     reklamvereni gizle
  show <key>           gizlemeyi kaldır
  dismiss <id>         bildirimleri işleme almadan kapat
  log [adet]           denetim kaydı
  categories           kategori listesi`)
  }
  const { pool } = await import('../lib/db')
  await pool().end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
