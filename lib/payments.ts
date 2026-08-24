import type { Quote } from './ranking'

/**
 * Ödeme sağlayıcısı arayüzü.
 *
 * Şu an yalnız `mock` var (ödeme kararı ertelendi). Polar / Dodo / Creem / Paddle'a
 * geçmek bu arayüzü uygulayan yeni bir dosya yazmak demek — çağıran taraf değişmez.
 *
 * Gerçek sağlayıcıya geçerken DEĞİŞMEYECEK iki kural:
 *   1) Tutar quote'tan gelir, istemciden değil.
 *   2) Stake'i yalnız imzası doğrulanmış webhook yazar; return URL kanıt değildir.
 */
export interface PaymentProvider {
  readonly id: string
  /** Quote'tan ödeme oturumu üretir ve kullanıcının yönlendirileceği URL'i döner. */
  createCheckout(quote: Quote, origin: string): Promise<{ redirectUrl: string }>
}

class MockProvider implements PaymentProvider {
  readonly id = 'mock'
  async createCheckout(quote: Quote, _origin: string) {
    // Gerçek sağlayıcıda burada API çağrısı olur ve hosted checkout URL'i döner.
    return { redirectUrl: `/pay/mock?intent=${encodeURIComponent(quote.quoteId)}` }
  }
}

export const provider: PaymentProvider = new MockProvider()

/**
 * Gerçek sağlayıcıya geçerken şablon:
 *
 * class PolarProvider implements PaymentProvider {
 *   readonly id = 'polar'
 *   async createCheckout(quote, origin) {
 *     const r = await fetch('https://api.polar.sh/v1/checkouts/', {
 *       method: 'POST',
 *       headers: { Authorization: `Bearer ${process.env.POLAR_TOKEN}`, 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         product_price_id: ...,
 *         amount: quote.suggestedAmountCents,          // sunucu otoritesi
 *         success_url: `${origin}/?intent=${quote.quoteId}`,
 *         metadata: { intent_id: quote.quoteId },      // webhook'ta eşleştirme anahtarı
 *       }),
 *     })
 *     const data = await r.json()
 *     return { redirectUrl: data.url }
 *   }
 * }
 *
 * Webhook tarafında (app/api/webhooks/<saglayici>/route.ts):
 *   1) RAW body üzerinde imza doğrula (parse edilmiş JSON üzerinde DEĞİL)
 *   2) event id'yi payments.provider_event_id UNIQUE alanına yaz -> idempotency
 *   3) metadata.intent_id ile intent'i bul, tutar/para birimini karşılaştır
 *   4) applyPayment(intentId, providerEventId) çağır
 *   5) hızlıca 2xx dön; ağır işi kuyruğa al
 */
