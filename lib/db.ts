import { Pool, type PoolClient } from 'pg'

/**
 * PostgreSQL bağlantısı.
 *
 * Neden SQLite'tan geçildi: Vercel'de dosya sistemi salt-okunurdur, yalnız
 * /tmp yazılabilir ve o da her serverless instance'a özeldir. Bir istekte
 * oluşturulan checkout, yönlendirme sonrası BAŞKA bir instance'a düşünce
 * "Checkout not found" veriyordu. Kalıcı ve paylaşılan bir veritabanı şart.
 *
 * Bağlantı adresi yalnız ortam değişkeninden okunur; kodda gömülü değildir.
 */

let _pool: Pool | null = null

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL tanımlı değil. Yerelde .env.local, Vercel’de proje ortam değişkenlerine ekleyin.',
    )
  }
  // sslmode parametresi pg tarafından ayrıştırılıp bizim açık ssl ayarımızı
  // eziyor ve yönetilen sağlayıcıların ara sertifikaları yüzünden
  // SELF_SIGNED_CERT_IN_CHAIN veriyor. Parametreyi çıkarıp TLS'i biz kuruyoruz.
  try {
    const u = new URL(url)
    u.searchParams.delete('sslmode')
    return u.toString()
  } catch {
    return url
  }
}

export function pool(): Pool {
  if (_pool) return _pool
  _pool = new Pool({
    connectionString: connectionString(),
    // Neon/Supabase gibi yönetilen sağlayıcılar TLS ister; sertifika zinciri
    // serverless imajda tam olmadığı için doğrulamayı gevşetiyoruz.
    ssl: process.env.PGSSL_DISABLE === '1' ? undefined : { rejectUnauthorized: false },
    // Serverless'ta her instance kendi havuzunu açar; küçük tutulmalı.
    max: Number(process.env.PGPOOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
  return _pool
}

/** Satır listesi döner. */
export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query(text, params)
  return res.rows as T[]
}

/** Tek satır (yoksa undefined). */
export async function q1<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await q<T>(text, params)
  return rows[0]
}

/**
 * Transaction. Ödeme işleme buradan geçer: idempotency kontrolü, yerleşim
 * güncellemesi ve olay kaydı ya hep birlikte yazılır ya hiç yazılmaz.
 */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* bağlantı zaten kopmuş olabilir */ }
    throw e
  } finally {
    client.release()
  }
}

/** Transaction içinde tek satır okumak için kısayol. */
export async function one<T = Record<string, unknown>>(
  c: PoolClient,
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const r = await c.query(text, params)
  return r.rows[0] as T | undefined
}
