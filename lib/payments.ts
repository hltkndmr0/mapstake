import type { Quote } from './ranking'

/**
 * Ödeme sağlayıcısı arayüzü.
 *
 * Whop üretim sağlayıcısıdır. Mock yalnız ALLOW_MOCK_PAY=1 ile yerel
 * geliştirme için açılır; çağıran checkout route'u sağlayıcıdan bağımsız kalır.
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
    if (process.env.ALLOW_MOCK_PAY !== '1') {
      throw new PaymentProviderError('Payment provider is not configured.')
    }
    // Gerçek sağlayıcıda burada API çağrısı olur ve hosted checkout URL'i döner.
    return { redirectUrl: `/pay/mock?intent=${encodeURIComponent(quote.quoteId)}` }
  }
}

type WhopCheckoutConfiguration = {
  purchase_url?: string
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}

class WhopProvider implements PaymentProvider {
  readonly id = 'whop'

  async createCheckout(quote: Quote, origin: string) {
    const apiKey = process.env.WHOP_API_KEY
    const accountId = process.env.WHOP_ACCOUNT_ID ?? process.env.WHOP_COMPANY_ID
    if (!apiKey || !accountId) {
      throw new PaymentProviderError('Whop is not configured.')
    }

    const returnUrl = new URL('/pay/complete', origin)
    returnUrl.searchParams.set('intent', quote.quoteId)
    returnUrl.searchParams.set('t', quote.territory.code)

    const response = await fetch(
      `${process.env.WHOP_API_BASE_URL ?? 'https://api.whop.com/api/v1'}/checkout_configurations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Api-Version-Date': process.env.WHOP_API_VERSION_DATE ?? '2026-08-25',
        },
        body: JSON.stringify({
          account_id: accountId,
          plan: {
            plan_type: 'one_time',
            release_method: 'buy_now',
            currency: 'usd',
            initial_price: quote.suggestedAmountCents / 100,
          },
          metadata: {
            intent_id: quote.quoteId,
            territory_code: quote.territory.code,
            expected_amount_cents: String(quote.suggestedAmountCents),
            currency: 'usd',
          },
          redirect_url: returnUrl.toString(),
          allow_promo_codes: false,
        }),
        cache: 'no-store',
      },
    )

    if (!response.ok) {
      console.error('Whop checkout configuration failed', {
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      })
      throw new PaymentProviderError('Whop checkout could not be created.')
    }

    const checkout = await response.json() as WhopCheckoutConfiguration
    let checkoutUrl: URL
    try {
      checkoutUrl = new URL(checkout.purchase_url ?? '')
    } catch {
      throw new PaymentProviderError('Whop returned an invalid checkout URL.')
    }
    if (
      checkoutUrl.protocol !== 'https:' ||
      (checkoutUrl.hostname !== 'whop.com' && !checkoutUrl.hostname.endsWith('.whop.com'))
    ) {
      throw new PaymentProviderError('Whop returned an invalid checkout URL.')
    }
    return { redirectUrl: checkoutUrl.toString() }
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (process.env.WHOP_API_KEY || process.env.WHOP_ACCOUNT_ID || process.env.WHOP_COMPANY_ID) {
    return new WhopProvider()
  }
  return new MockProvider()
}

/**
 * Webhook tarafında (app/api/webhooks/whop/route.ts):
 *   1) RAW body üzerinde imza doğrula (parse edilmiş JSON üzerinde DEĞİL)
 *   2) event id'yi payments.provider_event_id UNIQUE alanına yaz -> idempotency
 *   3) metadata.intent_id ile intent'i bul, tutar/para birimini karşılaştır
 *   4) applyPayment(intentId, providerEventId) çağır
 *   5) küçük atomik transaction'ı tamamlayıp Whop süresi içinde 2xx dön
 */
