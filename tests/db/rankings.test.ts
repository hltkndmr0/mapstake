import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DB_TESTS_ENABLED, SKIP_REASON, applySchema, resetDb, closeDb,
  seedTerritories, buy, type Fixture,
} from './helpers'

/**
 * Okuma sorguları — harita ve liste aynı gerçeği anlatmak zorunda.
 *
 * Kategori filtresi altı ayrı sorguya elle eklendi; birinde unutulsaydı
 * kullanıcı haritada "yazılım" derken tabloda başka bir yarışı görürdü.
 * Testler filtrenin her yolda uygulandığını sabitliyor.
 */
describe('sıralama ve liste sorguları', { skip: DB_TESTS_ENABLED ? false : SKIP_REASON }, () => {
  let fx: Fixture

  before(async () => { await applySchema() })
  after(async () => { await closeDb() })

  beforeEach(async () => {
    await resetDb()
    fx = await seedTerritories()
    // Testland: yazılımda beta lider (900), otomotivde oto tek başına.
    // İl: alfa. Otherland: alfa — kapsam filtresi için gerekli.
    await buy({ territoryCode: fx.countryCode, url: 'alfa.com', category: 'software', amountCents: 500 })
    await buy({ territoryCode: fx.countryCode, url: 'beta.com', category: 'software', amountCents: 900 })
    await buy({ territoryCode: fx.countryCode, url: 'oto.com', category: 'automotive', amountCents: 700 })
    await buy({ territoryCode: fx.provinceCode, url: 'alfa.com', category: 'software', amountCents: 400 })
    await buy({ territoryCode: fx.otherCountryCode, url: 'alfa.com', category: 'software', amountCents: 600 })
  })

  test('boardLevel kategoriye göre farklı lider döner', async () => {
    const { boardLevel } = await import('../../lib/board')

    const all = (await boardLevel(null)).find((e) => e.code === fx.countryCode)!
    assert.equal(all.leader!.key, 'beta.com') // mutlak toplamda 900 en büyük
    assert.equal(all.bidders, 3)

    const auto = (await boardLevel(null, 'automotive')).find((e) => e.code === fx.countryCode)!
    assert.equal(auto.leader!.key, 'oto.com')
    assert.equal(auto.bidders, 1)
    assert.equal(auto.totalCents, 700)

    // Hiç yerleşim olmayan kategoride ülke dolu listesine hiç girmez.
    const food = (await boardLevel(null, 'food')).find((e) => e.code === fx.countryCode)
    assert.equal(food, undefined)
  })

  test('boardLevel alt seviyede yalnız o ülkenin illerini verir', async () => {
    const { boardLevel } = await import('../../lib/board')
    const kids = await boardLevel(fx.countryId, 'software')
    assert.equal(kids.length, 1)
    assert.equal(kids[0].code, fx.provinceCode)
    assert.equal(kids[0].leader!.key, 'alfa.com')
  })

  test('topPlacements kapsamı ülkeyle sınırlar ve kategoriyi süzer', async () => {
    const { topPlacements } = await import('../../lib/board')

    const world = await topPlacements(20, null, 'software')
    // Dünya: Testland'de iki, ilde bir, Otherland'de bir yerleşim.
    assert.equal(world.length, 4)
    assert.ok(world.every((r) => r.category === 'software'))

    const scoped = await topPlacements(20, fx.countryCode, 'software')
    // Kapsam = ülke + illeri: alfa/ülke, beta/ülke, alfa/il.
    // Otherland dışarıda kalmalı.
    assert.equal(scoped.length, 3)
    assert.ok(scoped.every((r) => r.territory_code !== fx.otherCountryCode))
  })

  test('advertiserRanking markanın kapsamdaki TOPLAMINI sıralar', async () => {
    const { advertiserRanking } = await import('../../lib/rankings')

    const world = await advertiserRanking({ kind: 'world' }, 'software', 50)
    const alfa = world.find((r) => r.key === 'alfa.com')!
    // 500 (ülke) + 400 (il) + 600 (Otherland) = 1500
    assert.equal(alfa.totalCents, 1500)
    assert.equal(alfa.territories, 3)
    assert.equal(alfa.rank, 1) // beta 900 ile ikinci
    // İl ve Otherland'de #1, ülkede beta'nın arkasında -> iki slotta lider.
    assert.equal(alfa.leadCount, 2)

    const inCountry = await advertiserRanking({ kind: 'country', id: fx.countryId }, 'software', 50)
    const alfaLocal = inCountry.find((r) => r.key === 'alfa.com')!
    // Kapsam ülke+illeri: 500 + 400, Otherland sayılmaz.
    assert.equal(alfaLocal.totalCents, 900)
    assert.equal(inCountry.find((r) => r.key === 'beta.com')!.totalCents, 900)

    // Toplamlar eşit (900-900). Beraberlik tekil kuraldaki gibi çözülür:
    // o toplama ÖNCE ulaşan üstte. alfa ilk ödemeyi beta'dan önce yaptı.
    assert.equal(inCountry[0].key, 'alfa.com')
  })

  test('advertiserRanking tek bölgeye daraltılabilir', async () => {
    const { advertiserRanking } = await import('../../lib/rankings')
    const only = await advertiserRanking({ kind: 'territory', id: fx.provinceId }, null, 50)
    assert.equal(only.length, 1)
    assert.equal(only[0].key, 'alfa.com')
    assert.equal(only[0].totalCents, 400)
  })

  test('advertiserRanking sayfalama sıra numarasını kaydırır', async () => {
    const { advertiserRanking } = await import('../../lib/rankings')
    const page2 = await advertiserRanking({ kind: 'world' }, 'software', 1, 1)
    assert.equal(page2.length, 1)
    // 2. sayfanın ilk satırı #2'dir, #1 değil.
    assert.equal(page2[0].rank, 2)
    assert.equal(page2[0].key, 'beta.com')
  })

  test('territoryList BOŞ bölgeleri de döner ve il havuzunu ayrı gösterir', async () => {
    const { territoryList } = await import('../../lib/rankings')

    const countries = await territoryList(null, 'software')
    assert.equal(countries.length, 2) // Testland + Otherland
    const testland = countries.find((t) => t.code === fx.countryCode)!
    assert.equal(testland.totalCents, 1400) // 500 + 900
    assert.equal(testland.childPoolCents, 400) // ilin havuzu ayrı
    assert.equal(testland.childFilled, 1)

    // Otomotivde il boş: satır yine listede, lideri yok.
    const inAuto = await territoryList(fx.countryId, 'automotive')
    assert.equal(inAuto.length, 1)
    assert.equal(inAuto[0].leader, null)
    assert.equal(inAuto[0].totalCents, 0)
    assert.equal(inAuto[0].basePriceCents, 200)
  })

  test('categoryStandings boş kategorileri de listeler', async () => {
    const { categoryStandings } = await import('../../lib/rankings')
    const rows = await categoryStandings({ kind: 'territory', id: fx.countryId })

    // 15 kategorinin tamamı dönüyor: boş olan satılık envanterdir.
    assert.equal(rows.length, 15)
    const software = rows.find((r) => r.slug === 'software')!
    assert.equal(software.leader!.key, 'beta.com')
    assert.equal(software.bidders, 2)
    assert.equal(software.totalCents, 1400)

    const food = rows.find((r) => r.slug === 'food')!
    assert.equal(food.leader, null)
    assert.equal(food.bidders, 0)
    // Dolu kategoriler önce sıralanır.
    assert.ok(rows.findIndex((r) => r.slug === 'software') < rows.findIndex((r) => r.slug === 'food'))
  })

  test('categoryStandings kapsam liderini TOPLAM harcamaya göre seçer', async () => {
    const { categoryStandings } = await import('../../lib/rankings')
    const world = await categoryStandings({ kind: 'world' })
    const software = world.find((r) => r.slug === 'software')!
    // alfa tek bir bölgede lider değil ama küresel toplamı en büyük.
    assert.equal(software.leader!.key, 'alfa.com')
    assert.equal(software.leader!.totalCents, 1500)
  })

  test('scopeTotals slotu (bölge × kategori) olarak sayar', async () => {
    const { scopeTotals } = await import('../../lib/rankings')

    const country = await scopeTotals({ kind: 'country', id: fx.countryId }, null)
    // Testland/software, Testland/automotive, il/software = 3 slot
    assert.equal(country.slots, 3)
    assert.equal(country.advertisers, 3)
    assert.equal(country.totalCents, 2500)

    const onlySoftware = await scopeTotals({ kind: 'country', id: fx.countryId }, 'software')
    assert.equal(onlySoftware.slots, 2)
    assert.equal(onlySoftware.totalCents, 1800)
  })
})
