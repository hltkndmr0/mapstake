import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { unwrapWhopWebhook, WhopWebhookError } from '../lib/whop'

const SECRET = 'ws_test_secret_0123456789'

const validEvent = {
  id: 'evt_123',
  type: 'payment.succeeded',
  account_id: 'biz_abc',
  data: { id: 'pay_1', currency: 'usd', total: 6.5, subtotal: 6, metadata: { intent_id: 'i-1' } },
}

/** Whop imzası: HMAC-SHA256("{webhook-id}.{timestamp}.{raw-body}", secret). */
function sign(payload: string, opts: {
  id?: string; timestamp?: number; secret?: string
} = {}) {
  const id = opts.id ?? 'msg_1'
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000)
  const mac = createHmac('sha256', opts.secret ?? SECRET)
    .update(`${id}.${timestamp}.${payload}`, 'utf8')
    .digest('base64')
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${mac}`,
  })
}

beforeEach(() => { process.env.WHOP_WEBHOOK_SECRET = SECRET })

describe('geçerli imza', () => {
  test('doğru imzalı olay çözülür', () => {
    const payload = JSON.stringify(validEvent)
    const event = unwrapWhopWebhook(payload, sign(payload))
    assert.equal(event.id, 'evt_123')
    assert.equal(event.data.subtotal, 6)
    assert.equal(event.data.metadata?.intent_id, 'i-1')
  })

  test('birden çok imza sunulduğunda biri tutarsa yeterli (secret rotasyonu)', () => {
    const payload = JSON.stringify(validEvent)
    const headers = sign(payload)
    const good = headers.get('webhook-signature')!
    headers.set('webhook-signature', `v1,YmFkc2ln ${good}`)
    assert.doesNotThrow(() => unwrapWhopWebhook(payload, headers))
  })
})

describe('imza reddi', () => {
  test('gövde değiştirilirse imza tutmaz', () => {
    // Saldırgan tutarı $6'dan $0.01'e çekmeye çalışıyor.
    const payload = JSON.stringify(validEvent)
    const headers = sign(payload)
    const tampered = JSON.stringify({ ...validEvent, data: { ...validEvent.data, subtotal: 0.01 } })
    assert.throws(() => unwrapWhopWebhook(tampered, headers), WhopWebhookError)
  })

  test('yanlış secret ile imzalanmış olay reddedilir', () => {
    const payload = JSON.stringify(validEvent)
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload, { secret: 'ws_baska' })), WhopWebhookError)
  })

  test('webhook-id değiştirilirse imza tutmaz', () => {
    const payload = JSON.stringify(validEvent)
    const headers = sign(payload)
    headers.set('webhook-id', 'msg_degistirildi')
    assert.throws(() => unwrapWhopWebhook(payload, headers), WhopWebhookError)
  })

  test('v1 dışı imza sürümü kabul edilmez', () => {
    const payload = JSON.stringify(validEvent)
    const headers = sign(payload)
    headers.set('webhook-signature', headers.get('webhook-signature')!.replace('v1,', 'v0,'))
    assert.throws(() => unwrapWhopWebhook(payload, headers), WhopWebhookError)
  })

  test('imza başlıkları eksikse reddedilir', () => {
    const payload = JSON.stringify(validEvent)
    for (const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const headers = sign(payload)
      headers.delete(missing)
      assert.throws(() => unwrapWhopWebhook(payload, headers), WhopWebhookError, `${missing} eksikken geçti`)
    }
  })
})

describe('replay koruması', () => {
  test('5 dakikadan eski olay reddedilir', () => {
    const payload = JSON.stringify(validEvent)
    const old = Math.floor(Date.now() / 1000) - 6 * 60
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload, { timestamp: old })), WhopWebhookError)
  })

  test('gelecekten gelen olay reddedilir', () => {
    const payload = JSON.stringify(validEvent)
    const future = Math.floor(Date.now() / 1000) + 6 * 60
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload, { timestamp: future })), WhopWebhookError)
  })

  test('pencere içindeki olay kabul edilir', () => {
    const payload = JSON.stringify(validEvent)
    const recent = Math.floor(Date.now() / 1000) - 60
    assert.doesNotThrow(() => unwrapWhopWebhook(payload, sign(payload, { timestamp: recent })))
  })

  test('sayısal olmayan timestamp reddedilir', () => {
    const payload = JSON.stringify(validEvent)
    const headers = sign(payload)
    headers.set('webhook-timestamp', 'yakinda')
    assert.throws(() => unwrapWhopWebhook(payload, headers), WhopWebhookError)
  })
})

describe('gövde doğrulaması', () => {
  test('payment.succeeded dışındaki olaylar reddedilir', () => {
    // İmza geçerli ama olay türü desteklenmiyor: iade/chargeback henüz
    // işlenmiyor, sessizce ödeme sayılmamalı.
    const payload = JSON.stringify({ ...validEvent, type: 'payment.refunded' })
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload)), WhopWebhookError)
  })

  test('bozuk JSON reddedilir', () => {
    const payload = '{bozuk'
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload)), WhopWebhookError)
  })

  test('eksik alanlı ödeme gövdesi reddedilir', () => {
    const payload = JSON.stringify({ ...validEvent, data: { id: 'pay_1', currency: 'usd' } })
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload)), WhopWebhookError)
  })

  test('sayı olmayan total reddedilir', () => {
    const payload = JSON.stringify({ ...validEvent, data: { ...validEvent.data, total: '6' } })
    assert.throws(() => unwrapWhopWebhook(payload, sign(payload)), WhopWebhookError)
  })
})

describe('konfigürasyon hatası imza hatasından ayrılır', () => {
  test('secret tanımlı değilse WhopWebhookError DEĞİL düz Error atılır', () => {
    // Bu ayrım route katmanında 503 (bizim hatamız) ile 401 (saldırı)
    // ayrımını üretiyor; karışırsa yanlış konfigürasyon saldırı gibi loglanır.
    delete process.env.WHOP_WEBHOOK_SECRET
    const payload = JSON.stringify(validEvent)
    assert.throws(() => unwrapWhopWebhook(payload, new Headers()), (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.ok(!(err instanceof WhopWebhookError), 'imza hatası olarak sınıflandırıldı')
      return true
    })
  })
})
