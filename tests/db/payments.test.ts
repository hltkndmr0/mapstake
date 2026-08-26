import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DB_TESTS_ENABLED, SKIP_REASON, applySchema, resetDb, closeDb,
  seedTerritories, buy, placementTotal, cashCents, type Fixture,
} from './helpers'

/**
 * Ödeme zinciri — ürünün para gören tek yolu.
 *
 * Buradaki her test, elle test edilirken bulunmuş ya da bulunabilecek bir
 * hatayı sabitler: çift kredi, kategori sızıntısı, paket alımında nakitin
 * iki kez sayılması, eşzamanlı ödemede kaybolan toplam.
 */
describe('applyPayment', { skip: DB_TESTS_ENABLED ? false : SKIP_REASON }, () => {
  let fx: Fixture

  before(async () => { await applySchema() })
  beforeEach(async () => { await resetDb(); fx = await seedTerritories() })
  after(async () => { await closeDb() })

  test('ödeme yerleşime dönüşür ve sıra ödeme anında hesaplanır', async () => {
    const a = await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 900 })
    assert.equal(a.ok, true)
    assert.equal(a.rank, 1)
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 900)

    // Tabanı ödeyen ama lideri geçmeyen ikinci sıraya düşer.
    const b = await buy({ territoryCode: fx.countryCode, url: 'beta.com', category: 'software', amountCents: 500 })
    assert.equal(b.rank, 2)
    assert.equal(await placementTotal(fx.countryCode, 'beta.com', 'software'), 500)
  })

  test('tabanın altındaki istek lideri geçecek tutara yükseltilir', async () => {
    // Fiyatın otoritesi sunucu: istemcinin gönderdiği tutar yalnız bir istek.
    // 300 sent, ülke tabanının (500) altında -> sunucu kendi rakamını uygular.
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 900 })
    await buy({ territoryCode: fx.countryCode, url: 'beta.com', category: 'software', amountCents: 300 })

    // 900 + outbidStep(100) - mevcut(0) = 1000
    assert.equal(await placementTotal(fx.countryCode, 'beta.com', 'software'), 1000)
  })

  test('aynı sağlayıcı olayı iki kez gelirse stake bir kez yazılır', async () => {
    await buy({
      territoryCode: fx.countryCode, url: 'alfa.com', category: 'software',
      amountCents: 500, eventId: 'evt-tekrar',
    })
    // İkinci alım aynı olay kimliğiyle geliyor: webhook yeniden teslimi.
    const again = await buy({
      territoryCode: fx.countryCode, url: 'alfa.com', category: 'software',
      amountCents: 500, eventId: 'evt-tekrar',
    })

    assert.equal(again.duplicate, true)
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
    assert.equal(await cashCents(), 500)
  })

  test('aynı intent farklı olay kimliğiyle ikinci kez krediye dönüşemez', async () => {
    const { applyPayment } = await import('../../lib/ranking')
    const first = await buy({
      territoryCode: fx.countryCode, url: 'alfa.com', category: 'software',
      amountCents: 500, eventId: 'evt-1',
    })
    const second = await applyPayment(first.intentId, 'evt-2-baska')

    assert.equal(second.ok, false)
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
  })

  test('kategori sızdırmaz: otomotive ödeme yazılım sıralamasını değiştirmez', async () => {
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'automotive', amountCents: 9000 })

    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'automotive'), 9000)
    // Otomotivdeki dev ödeme yazılımda hiçbir satır oluşturmamalı.
    assert.equal(await placementTotal(fx.countryCode, 'oto.com', 'software'), null)
  })

  test('aynı marka aynı bölgede iki kategoride ayrı slot tutar', async () => {
    // Eski UNIQUE (bölge, reklamveren) kısıtı bunu engelliyordu.
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    const second = await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'food', amountCents: 600 })

    assert.equal(second.ok, true)
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'food'), 600)
  })

  test('üstüne ekleme toplamı büyütür, yeni satır açmaz', async () => {
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 200 })

    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 700)
    const { q1 } = await import('../../lib/db')
    const rows = await q1<{ n: string }>(
      `SELECT COUNT(*) AS n FROM placements p JOIN advertisers a ON a.id = p.advertiser_id
        WHERE a.canonical_key = 'alfa.com'`,
    )
    assert.equal(Number(rows!.n), 1)
  })

  test('toplam değişince beraberlik zaman damgası da güncellenir', async () => {
    const { q1 } = await import('../../lib/db')
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    const before = await q1<{ t: Date }>(
      `SELECT reached_current_total_at AS t FROM placements`,
    )
    await new Promise((r) => setTimeout(r, 25))
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 100 })
    const after = await q1<{ t: Date }>(`SELECT reached_current_total_at AS t FROM placements`)

    // Bu alan olmadan beraberlik çözümü denetlenebilir olmaz.
    assert.ok(new Date(after!.t).getTime() > new Date(before!.t).getTime())
  })

  test('paket alım: il bedelsiz gelir, nakit bir kez sayılır', async () => {
    const res = await buy({
      territoryCode: fx.countryCode, url: 'alfa.com', category: 'software',
      amountCents: 500, bundleCode: fx.provinceCode,
    })
    assert.equal(res.ok, true)

    // İki yerleşim, tek ödeme.
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 500)
    assert.equal(await placementTotal(fx.provinceCode, 'alfa.com', 'software'), 500)
    assert.equal(await cashCents(), 500)

    const { q1 } = await import('../../lib/db')
    const bundled = await q1<{ n: string }>(
      `SELECT COUNT(*) AS n FROM stake_events WHERE bundled = TRUE`,
    )
    // Paket kredisi nakitten bu bayrakla ayrışır.
    assert.equal(Number(bundled!.n), 1)
  })

  test('paket il ile ülke AYNI kategoriye yazılır', async () => {
    await buy({
      territoryCode: fx.countryCode, url: 'alfa.com', category: 'automotive',
      amountCents: 500, bundleCode: fx.provinceCode,
    })
    assert.equal(await placementTotal(fx.provinceCode, 'alfa.com', 'automotive'), 500)
    assert.equal(await placementTotal(fx.provinceCode, 'alfa.com', 'software'), null)
  })

  test('eşzamanlı iki ödeme aynı slotta toplamı kaybetmez', async () => {
    const { computeQuote, createIntent, applyPayment, getTerritoryBy } = await import('../../lib/ranking')
    const t = (await getTerritoryBy('code', fx.countryCode))!

    // İki ayrı intent, aynı (bölge, marka, kategori) slotu.
    const intents: string[] = []
    for (const amount of [500, 600]) {
      const qr = await computeQuote({
        territoryId: t.id, rawUrl: 'alfa.com', mode: 'product',
        amountCents: amount, category: 'software',
      })
      assert.equal(qr.ok, true)
      if (!qr.ok) return
      await createIntent(qr.quote, null, 'mock')
      intents.push(qr.quote.quoteId)
    }

    // Paralel işlenirler: FOR UPDATE olmasaydı biri diğerinin yazdığını ezerdi.
    await Promise.all([
      applyPayment(intents[0], 'evt-par-1'),
      applyPayment(intents[1], 'evt-par-2'),
    ])

    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), 1100)
  })

  test('tutar/para birimi uyuşmazlığı ödemeyi reddeder', async () => {
    const { computeQuote, createIntent, applyPayment, getTerritoryBy } = await import('../../lib/ranking')
    const t = (await getTerritoryBy('code', fx.countryCode))!
    const qr = await computeQuote({
      territoryId: t.id, rawUrl: 'alfa.com', mode: 'product',
      amountCents: 500, category: 'software',
    })
    assert.equal(qr.ok, true)
    if (!qr.ok) return
    await createIntent(qr.quote, null, 'mock')

    const wrongAmount = await applyPayment(qr.quote.quoteId, 'evt-tutar', {
      provider: 'mock', amountCents: 100, currency: 'usd',
    })
    assert.equal(wrongAmount.ok, false)

    const wrongCurrency = await applyPayment(qr.quote.quoteId, 'evt-doviz', {
      provider: 'mock', amountCents: 500, currency: 'eur',
    })
    assert.equal(wrongCurrency.ok, false)

    // Hiçbiri yazılmadı.
    assert.equal(await placementTotal(fx.countryCode, 'alfa.com', 'software'), null)
    assert.equal(await cashCents(), 0)
  })
})
