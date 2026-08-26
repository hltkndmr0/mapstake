import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DB_TESTS_ENABLED, SKIP_REASON, applySchema, resetDb, closeDb,
  seedTerritories, buy, placementTotal, cashCents, type Fixture,
} from './helpers'

/**
 * Moderasyon — kategoriyi reklamverenin seçmesinin karşı ağırlığı.
 *
 * En riskli işlem taşıma: marka hedef kategoride zaten yarışıyorsa iki satır
 * birleşiyor ve bu sırada para geçmişi (stake olayları) taşınmak zorunda.
 * Yanlış yapılırsa ödeme kaydı ile yerleşim toplamı ayrışır — mutabakat
 * bozulur. Testler bu ayrışmayı yakalamak için var.
 */
describe('moderasyon', { skip: DB_TESTS_ENABLED ? false : SKIP_REASON }, () => {
  let fx: Fixture

  before(async () => { await applySchema() })
  after(async () => { await closeDb() })
  beforeEach(async () => { await resetDb(); fx = await seedTerritories() })

  async function placementIdOf(code: string, key: string, category: string): Promise<number> {
    const { q1 } = await import('../../lib/db')
    const row = await q1<{ id: string }>(
      `SELECT p.id FROM placements p
         JOIN territories t ON t.id = p.territory_id
         JOIN advertisers a ON a.id = p.advertiser_id
        WHERE t.code = $1 AND a.canonical_key = $2 AND p.category = $3`,
      [code, key, category],
    )
    return Number(row!.id)
  }

  test('bildirim kuyruğa girer, aynı kişinin ikinci bildirimi çoğaltmaz', async () => {
    const { reportPlacement, openReports } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })

    const base = {
      territoryCode: fx.countryCode, advertiserKey: 'oto.com', category: 'software',
      suggestedCategory: 'automotive', reason: 'araba markası', reporterHash: 'hash-a',
    }
    const first = await reportPlacement(base)
    const second = await reportPlacement(base)

    assert.equal(first.ok, true)
    assert.equal(second.ok && second.duplicate, true)

    const open = await openReports()
    assert.equal(open.length, 1)
    assert.equal(open[0].reports, 1)
    assert.equal(open[0].suggestedCategory, 'automotive')
    assert.equal(open[0].currentCategory, 'software')
  })

  test('farklı kişilerin bildirimleri aynı yerleşimde toplanır', async () => {
    const { reportPlacement, openReports } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })

    for (const h of ['hash-a', 'hash-b', 'hash-c']) {
      await reportPlacement({
        territoryCode: fx.countryCode, advertiserKey: 'oto.com', category: 'software',
        suggestedCategory: 'automotive', reason: null, reporterHash: h,
      })
    }
    const open = await openReports()
    assert.equal(open.length, 1)
    assert.equal(open[0].reports, 3)
  })

  test('olmayan ilan bildirilemez', async () => {
    const { reportPlacement } = await import('../../lib/moderation')
    const res = await reportPlacement({
      territoryCode: fx.countryCode, advertiserKey: 'yok.com', category: 'software',
      suggestedCategory: null, reason: null, reporterHash: 'hash-a',
    })
    assert.equal(res.ok, false)
  })

  test('taşıma: hedefte satır yoksa kategori değişir, bildirimler kapanır', async () => {
    const { reportPlacement, recategorize, openReports } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })
    const id = await placementIdOf(fx.countryCode, 'oto.com', 'software')
    await reportPlacement({
      territoryCode: fx.countryCode, advertiserKey: 'oto.com', category: 'software',
      suggestedCategory: 'automotive', reason: null, reporterHash: 'hash-a',
    })

    const res = await recategorize(id, 'automotive', 'test')
    assert.equal(res.ok && res.merged, false)
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'automotive'), 500)
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'software'), null)
    assert.equal((await openReports()).length, 0)

    // Akış rozeti de düzelmeli, yoksa geçmiş yanlış kategori gösterir.
    const { q1 } = await import('../../lib/db')
    const act = await q1<{ category: string }>(`SELECT category FROM activity LIMIT 1`)
    assert.equal(act!.category, 'automotive')
  })

  test('taşıma: hedefte satır varsa birleştirir ve para geçmişini taşır', async () => {
    const { recategorize } = await import('../../lib/moderation')
    // Aynı marka iki kategoride: biri yanlış yere konmuş.
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'automotive', amountCents: 700 })
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })
    const wrongId = await placementIdOf(fx.countryCode, 'oto.com', 'software')

    const res = await recategorize(wrongId, 'automotive', 'test')
    assert.equal(res.ok && res.merged, true)
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'automotive'), 1200)
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'software'), null)

    const { q1 } = await import('../../lib/db')
    // İki stake olayı da hedef yerleşime bağlı olmalı: biri kaybolursa
    // ödeme kaydı ile yerleşim toplamı ayrışır.
    const orphan = await q1<{ n: string }>(
      `SELECT COUNT(*) AS n FROM stake_events se
        LEFT JOIN placements p ON p.id = se.placement_id
        WHERE p.id IS NULL`,
    )
    assert.equal(Number(orphan!.n), 0)
    const events = await q1<{ n: string; total: string }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(delta_cents),0) AS total FROM stake_events`,
    )
    assert.equal(Number(events!.n), 2)
    assert.equal(Number(events!.total), 1200)
    // Nakit mutabakatı bozulmadı.
    assert.equal(await cashCents(), 1200)
  })

  test('taşıma birleştirirken bildirimleri de hedefe taşır', async () => {
    const { reportPlacement, recategorize, openReports } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'automotive', amountCents: 700 })
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })
    const wrongId = await placementIdOf(fx.countryCode, 'oto.com', 'software')
    await reportPlacement({
      territoryCode: fx.countryCode, advertiserKey: 'oto.com', category: 'software',
      suggestedCategory: 'automotive', reason: null, reporterHash: 'hash-a',
    })

    await recategorize(wrongId, 'automotive', 'test')

    // Kaynak satır silindi; ON DELETE CASCADE bildirimi de silseydi
    // "kim ne bildirmişti" kaydı kaybolurdu.
    const { q1 } = await import('../../lib/db')
    const kept = await q1<{ n: string; status: string }>(
      `SELECT COUNT(*) AS n, MIN(status) AS status FROM category_reports`,
    )
    assert.equal(Number(kept!.n), 1)
    assert.equal(kept!.status, 'accepted')
    assert.equal((await openReports()).length, 0)
  })

  test('taşıma bilinmeyen kategoriye ya da aynı kategoriye izin vermez', async () => {
    const { recategorize } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })
    const id = await placementIdOf(fx.countryCode, 'oto.com', 'software')

    assert.equal((await recategorize(id, 'uydurma', 'test')).ok, false)
    assert.equal((await recategorize(id, 'software', 'test')).ok, false)
    assert.equal((await recategorize(999999, 'automotive', 'test')).ok, false)
    // Hiçbiri veriye dokunmadı.
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'software'), 500)
  })

  test('her işlem denetim kaydına yazılır', async () => {
    const { recategorize, setAdvertiserStatus } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'software', amountCents: 500 })
    const id = await placementIdOf(fx.countryCode, 'oto.com', 'software')

    await recategorize(id, 'automotive', 'deniz')
    await setAdvertiserStatus('oto.com', 'hidden', 'deniz', 'spam')

    const { q } = await import('../../lib/db')
    const log = await q<{ action: string; actor: string; detail: Record<string, unknown> }>(
      `SELECT action, actor, detail FROM moderation_log ORDER BY id`,
    )
    assert.equal(log.length, 2)
    assert.equal(log[0].action, 'recategorize')
    assert.equal(log[0].detail.from, 'software')
    assert.equal(log[0].detail.to, 'automotive')
    assert.equal(log[0].actor, 'deniz')
    assert.equal(log[1].action, 'status:hidden')
  })

  test('gizlenen reklamveren haritadan ve listeden düşer', async () => {
    const { setAdvertiserStatus } = await import('../../lib/moderation')
    const { boardLevel } = await import('../../lib/board')
    const { advertiserRanking } = await import('../../lib/rankings')

    await buy({ territoryCode: fx.countryCode, url: 'spam.com', category: 'software', amountCents: 900 })
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    assert.equal((await boardLevel(null, 'software'))[0].leader!.key, 'spam.com')

    await setAdvertiserStatus('spam.com', 'hidden', 'test')

    // Liderlik bir sonrakine geçer; ödeme kaydı silinmez.
    assert.equal((await boardLevel(null, 'software'))[0].leader!.key, 'alfa.com')
    const rank = await advertiserRanking({ kind: 'world' }, 'software', 50)
    assert.equal(rank.length, 1)
    assert.equal(await cashCents(), 1400)

    // Geri açılınca yerini alır.
    await setAdvertiserStatus('spam.com', 'approved', 'test')
    assert.equal((await boardLevel(null, 'software'))[0].leader!.key, 'spam.com')
  })

  test('bildirimler işleme alınmadan kapatılabilir', async () => {
    const { reportPlacement, dismissReports, openReports } = await import('../../lib/moderation')
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    const id = await placementIdOf(fx.countryCode, 'alfa.com', 'software')
    await reportPlacement({
      territoryCode: fx.countryCode, advertiserKey: 'alfa.com', category: 'software',
      suggestedCategory: null, reason: 'sebepsiz', reporterHash: 'hash-a',
    })

    assert.equal(await dismissReports(id, 'test'), 1)
    assert.equal((await openReports()).length, 0)
    // Yerleşim yerinde kalır.
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
  })
})
