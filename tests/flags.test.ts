import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { flagFile, flagUrl, hasFlag } from '../lib/flags'

describe('bayrak eşlemesi', () => {
  test('ülke kodu ISO2 dosya adına çözülür', () => {
    assert.equal(flagFile('TUR'), 'tr')
    assert.equal(flagFile('USA'), 'us')
    assert.equal(flagFile('DEU'), 'de')
  })

  test('alt birim kodu ülkesinin bayrağını verir', () => {
    // Harita ve liste il satırında ülkenin bayrağını gösteriyor; bu eşleme
    // olmadan her ilde ayrı bir dallanma yazmak gerekirdi.
    assert.equal(flagFile('TR-34'), 'tr')
    assert.equal(flagFile('US-CA'), 'us')
  })

  test('doğrudan ISO2 de kabul edilir', () => {
    assert.equal(flagFile('TR'), 'tr')
    assert.equal(flagFile('tr'), 'tr')
  })

  test('bayrağı olmayan bölgede null döner, kırık görsel değil', () => {
    // Natural Earth listesinde iso2 taşımayan üç bölge var (KAS/SOL/CYN).
    assert.equal(flagFile('CYN'), null)
    assert.equal(flagUrl('CYN'), null)
    assert.equal(hasFlag('CYN'), false)
    assert.equal(flagFile('ZZZ'), null)
    assert.equal(flagFile(null), null)
    assert.equal(flagFile(''), null)
  })

  test('url public/flags altını gösterir', () => {
    assert.equal(flagUrl('TUR'), '/flags/tr.svg')
  })
})
