import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, withUtm } from '../lib/normalize'

/** Başarılı sonucun canonicalKey'ini döndürür, hata ise testi düşürür. */
function keyOf(raw: string, mode: 'product' | 'social' = 'product'): string {
  const r = normalize(raw, mode)
  assert.ok(r.ok, `beklenmedik hata: ${r.ok ? '' : r.error} (${raw})`)
  return r.canonicalKey
}

function errorOf(raw: string, mode: 'product' | 'social' = 'product'): string {
  const r = normalize(raw, mode)
  assert.ok(!r.ok, `kabul edilmemeliydi: ${raw}`)
  return r.error
}

describe('product — kimlik alan adına indirgenir', () => {
  test('path, query ve fragment atılır', () => {
    // README'deki örnek: aynı marka farklı linklerle iki kez yarışamamalı.
    assert.equal(keyOf('https://www.ornek.com/fiyatlar?x=1'), 'ornek.com')
    assert.equal(keyOf('ornek.com/a/b/c#bolum'), 'ornek.com')
    assert.equal(keyOf('http://m.ornek.com'), 'ornek.com')
  })

  test('şema yazılmasa da kabul edilir', () => {
    assert.equal(keyOf('ornek.com'), 'ornek.com')
  })

  test('büyük harf ve sondaki nokta normalize edilir', () => {
    assert.equal(keyOf('HTTPS://WWW.Ornek.COM.'), 'ornek.com')
  })

  test('aynı markanın farklı yazımları tek anahtara iner', () => {
    const forms = ['ornek.com', 'www.ornek.com', 'https://ornek.com/', 'HTTP://M.ORNEK.COM/x?y=1']
    const keys = new Set(forms.map((f) => keyOf(f)))
    assert.equal(keys.size, 1, `tek anahtar bekleniyordu, çıkanlar: ${[...keys].join(', ')}`)
  })
})

describe('product — reddedilen hedefler', () => {
  test('alan adı olmayan girdi', () => {
    errorOf('merhaba')
    errorOf('')
  })

  test('özel/yerel adresler (SSRF koruması)', () => {
    errorOf('http://localhost:3000')
    errorOf('http://127.0.0.1')
    errorOf('http://10.0.0.5')
    errorOf('http://192.168.1.1')
    errorOf('http://172.16.0.1')
    // Bulut metadata servisi — sunucu kimlik bilgisi sızdırabilecek adres.
    errorOf('http://169.254.169.254')
  })

  test('sohbet ve davet linkleri', () => {
    errorOf('https://t.me/kanal')
    errorOf('https://chat.whatsapp.com/abc')
    errorOf('https://discord.gg/abc')
  })

  test('kısaltılmış linkler (gerçek hedef gizlenemez)', () => {
    errorOf('https://bit.ly/abc')
    errorOf('https://t.co/abc')
  })

  test('URL içinde kimlik bilgisi', () => {
    errorOf('https://kullanici:sifre@ornek.com')
  })

  test('sosyal profil product sekmesinde reddedilir', () => {
    assert.match(errorOf('https://x.com/biri'), /Social profile tab/)
  })

  test('aşırı uzun girdi', () => {
    errorOf(`https://ornek.com/${'a'.repeat(600)}`)
  })
})

describe('product — uygulama mağazaları', () => {
  test('App Store uygulama kimliği korunur', () => {
    assert.equal(keyOf('https://apps.apple.com/tr/app/uygulama/id1234567890'), 'apps.apple.com/id1234567890')
  })

  test('Play Store paket adı korunur', () => {
    assert.equal(keyOf('https://play.google.com/store/apps/details?id=com.ornek.uygulama'),
      'play.google.com/com.ornek.uygulama')
  })

  test('kimliksiz mağaza linki normal alan adına düşer', () => {
    assert.equal(keyOf('https://apps.apple.com/tr/charts'), 'apps.apple.com')
  })
})

describe('social — profil kimliği', () => {
  test('twitter.com x.com olarak tekilleştirilir', () => {
    assert.equal(keyOf('https://twitter.com/Jack', 'social'), 'x.com/jack')
    assert.equal(keyOf('https://x.com/jack', 'social'), 'x.com/jack')
  })

  test('baştaki @ kabul edilir', () => {
    assert.equal(keyOf('@x.com/jack', 'social'), 'x.com/jack')
  })

  test('gönderi linki profil sayılmaz', () => {
    errorOf('https://instagram.com/p/Abc123', 'social')
    errorOf('https://x.com/biri/status/123', 'social')
  })

  test('rezerve rotalar profil sayılmaz', () => {
    errorOf('https://x.com/home', 'social')
    errorOf('https://github.com/pricing', 'social')
  })

  test('GitHub kullanıcı ve repo kabul, derin rota red', () => {
    assert.equal(keyOf('https://github.com/kullanici', 'social'), 'github.com/kullanici')
    assert.equal(keyOf('https://github.com/kullanici/depo', 'social'), 'github.com/kullanici/depo')
    errorOf('https://github.com/kullanici/depo/issues/1', 'social')
  })

  test('YouTube kanalı kabul, tek video red', () => {
    assert.equal(keyOf('https://youtube.com/@kanal', 'social'), 'youtube.com/@kanal')
    assert.equal(keyOf('https://youtube.com/channel/UC12345', 'social'), 'youtube.com/channel/UC12345')
    errorOf('https://youtube.com/watch?v=abc', 'social')
  })

  test('desteklenmeyen platform', () => {
    assert.match(errorOf('https://linkedin.com/in/biri', 'social'), /X, Instagram, GitHub, YouTube/)
  })
})

describe('withUtm', () => {
  test('kaynak etiketi eklenir', () => {
    assert.equal(withUtm('https://ornek.com', 'cartogram'), 'https://ornek.com/?utm_source=cartogram')
  })

  test('mevcut query korunur', () => {
    assert.match(withUtm('https://ornek.com/?a=1', 'cartogram'), /a=1/)
  })

  test('bozuk URL olduğu gibi döner', () => {
    assert.equal(withUtm('gecersiz', 'cartogram'), 'gecersiz')
  })
})
