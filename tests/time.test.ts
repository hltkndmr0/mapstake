import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { relTime } from '../lib/time'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

describe('relTime', () => {
  test('board.ts biçimi (ISO + Z) çözülür', () => {
    // Regresyon: fonksiyon sonuna ikinci bir "Z" ekliyordu, tarih NaN oluyor
    // ve arayüzde "NaNd ago" görünüyordu.
    assert.equal(relTime(ago(5 * 60_000)), '5m ago')
  })

  test('zaman dilimsiz eski biçim UTC sayılır', () => {
    const iso = new Date(Date.now() - 90 * 60_000).toISOString()
    const legacy = iso.replace('T', ' ').replace(/\.\d+Z$/, '')
    assert.equal(relTime(legacy), '1h ago')
  })

  test('ofsetli tarih kabul edilir', () => {
    const then = new Date(Date.now() - 2 * 60 * 60_000)
    const offset = then.toISOString().replace('Z', '+00:00')
    assert.equal(relTime(offset), '2h ago')
  })

  test('eşikler', () => {
    assert.equal(relTime(ago(30_000)), 'just now')
    assert.equal(relTime(ago(59 * 60_000)), '59m ago')
    assert.equal(relTime(ago(23 * 3_600_000)), '23h ago')
    assert.equal(relTime(ago(50 * 3_600_000)), '2d ago')
  })

  test('gelecekteki tarih negatife düşmez', () => {
    assert.equal(relTime(new Date(Date.now() + 60_000).toISOString()), 'just now')
  })

  test('çözülemeyen tarih NaN değil boş string verir', () => {
    assert.equal(relTime('bozuk-tarih'), '')
  })
})
