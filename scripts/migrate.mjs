// Şemayı PostgreSQL'e uygular. Idempotent: CREATE TABLE IF NOT EXISTS.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// Şema/seed işleri için doğrudan (session-mode) bağlantı tercih edilir;
// uygulama runtime'ı ise transaction pooler'ı kullanır.
const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL yok. `vercel env pull .env.local` sonrası tekrar deneyin.')
  process.exit(1)
}

// sslmode parametresi pg'nin açık ssl ayarını ezip SELF_SIGNED_CERT_IN_CHAIN
// hatası veriyor; çıkarıp TLS'i elle kuruyoruz.
function clean(u) {
  try { const x = new URL(u); x.searchParams.delete('sslmode'); return x.toString() } catch { return u }
}

const client = new pg.Client({
  connectionString: clean(url),
  ssl: process.env.PGSSL_DISABLE === '1' ? undefined : { rejectUnauthorized: false },
})
await client.connect()
await client.query(readFileSync(join(process.cwd(), 'lib', 'schema.sql'), 'utf8'))
const { rows } = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`,
)
console.log('[migrate] tablolar:', rows.map((r) => r.table_name).join(', '))
await client.end()
