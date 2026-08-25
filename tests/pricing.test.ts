import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { requiredPaymentFor, projectRank, floorFor } from '../lib/ranking'
import { PRICING, formatMoney } from '../lib/brand'
import { row, territory } from './helpers'

describe('requiredPaymentFor — lideri geçmek için gereken ÖDEME', () => {
  test('boş bölgede taban fiyat istenir', () => {
    // Lider yok (0), kullanıcının birikmiş toplamı yok (0), ülke tabanı $5.
    assert.equal(requiredPaymentFor(0, 0, 500), 500)
  })

  test('mevcut toplam düşülür — fazla tahsilat regresyonu', () => {
    // Lider $10, kullanıcının o bölgede zaten $5'i var, top-up tabanı $1.
    // Doğru cevap $6 (10 + 1 − 5). Çıkarma unutulursa $11 çıkar ve
    // kullanıcı iki kez ödemiş olur — bu testin varlık sebebi tam olarak bu.
    assert.equal(requiredPaymentFor(1000, 500, 100), 600)
  })

  test('taban, hesaplanan farktan büyükse taban kazanır', () => {
    // Lider $10 ama kullanıcının zaten $20'si var: fark negatif çıkar.
    // Negatif ya da sıfır tutar tahsil edilemez, taban uygulanır.
    assert.equal(requiredPaymentFor(1000, 2000, 100), 100)
  })

  test('sonuç hiçbir girdide negatif olamaz', () => {
    for (const existing of [0, 500, 5_000, 1_000_000]) {
      const amount = requiredPaymentFor(1000, existing, PRICING.topUpFloorCents)
      assert.ok(amount >= PRICING.topUpFloorCents, `existing=${existing} için ${amount}`)
    }
  })

  test('outbidStep kadar fark yeterlidir, fazlası değil', () => {
    assert.equal(requiredPaymentFor(1000, 0, 100), 1000 + PRICING.outbidStepCents)
  })
})

describe('projectRank — ödeme sonrası oluşacak sıra', () => {
  test('en yüksek toplam #1 olur', () => {
    assert.equal(projectRank([row(7, 1000)], null, 1500), 1)
  })

  test('beraberlikte yeni gelen ALTTA kalır', () => {
    // Eşit toplam liderliği devralmaya yetmez: mevcut lider #1 kalır.
    assert.equal(projectRank([row(7, 1000)], null, 1000), 2)
  })

  test('outbidStep sonrası liderlik devralınır', () => {
    assert.equal(projectRank([row(7, 1000)], null, 1000 + PRICING.outbidStepCents), 1)
  })

  test('kullanıcının kendi yerleşimi kendisiyle yarışmaz', () => {
    // 7 numaralı reklamveren kendi $10'unu $15'e çıkarıyor; kendi eski
    // satırı sayılırsa yanlışlıkla #2 görünürdü.
    assert.equal(projectRank([row(7, 1000)], 7, 1500), 1)
  })

  test('kalabalık bölgede doğru sıra', () => {
    const rows = [row(1, 5000), row(2, 3000), row(3, 1000)]
    assert.equal(projectRank(rows, null, 6000), 1)
    assert.equal(projectRank(rows, null, 4000), 2)
    assert.equal(projectRank(rows, null, 2000), 3)
    assert.equal(projectRank(rows, null, 500), 4)
  })

  test('boş bölgeye ilk giren #1 olur', () => {
    assert.equal(projectRank([], null, 500), 1)
  })
})

describe('floorFor — taban fiyat seçimi', () => {
  test('yeni yerleşim bölgenin kendi tabanını kullanır', () => {
    assert.equal(floorFor(territory({ base_price_cents: 500 }), false), 500)
    assert.equal(floorFor(territory({ kind: 'admin1', base_price_cents: 200 }), false), 200)
  })

  test('mevcut yerleşimi büyütmek top-up tabanına düşer', () => {
    assert.equal(floorFor(territory({ base_price_cents: 500 }), true), PRICING.topUpFloorCents)
  })
})

describe('formatMoney', () => {
  test('tam dolar kuruşsuz yazılır', () => {
    assert.equal(formatMoney(500), '$5')
    assert.equal(formatMoney(0), '$0')
  })

  test('küsuratlı tutar iki hane gösterir', () => {
    assert.equal(formatMoney(250), '$2.50')
    assert.equal(formatMoney(1234), '$12.34')
  })
})
