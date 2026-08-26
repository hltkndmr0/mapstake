import { q } from './db'

/**
 * Kategoriler — yarışın kapsamı.
 *
 * Ürün kararı: bir yazılım markası bir otomotiv markasını geçmek zorunda
 * kalmaz. Envanter birimi (bölge × kategori); "Türkiye / Software" ile
 * "Türkiye / Automotive" ayrı slotlardır ve ayrı sıralanır.
 *
 * Liste TEK yerde: lib/schema.sql. İkon ve renk dahil her şey veritabanından
 * okunur — arayüzde ikinci bir kopya tutulsaydı yeni kategori eklerken
 * ikisinden biri geride kalırdı.
 */
export type Category = {
  slug: string
  name: string
  icon: string
  color: string
  sortOrder: number
}

export const DEFAULT_CATEGORY = 'other'

/** "Tümü" görünümü: kategori filtresi yok, kazanan mutlak toplamdır. */
export const ALL_CATEGORIES = null

// Kategori kümesi sabit ve küçük; her istekte sorgulamak boşuna gidiş-dönüş.
// Süreç ömrü boyunca (serverless'ta örnek başına) tutulur.
const TTL_MS = 5 * 60_000
let cache: { at: number; rows: Category[] } | null = null

export async function listCategories(): Promise<Category[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  const rows = await q<{ slug: string; name: string; icon: string; color: string; sort_order: number }>(
    `SELECT slug, name, icon, color, sort_order FROM categories ORDER BY sort_order ASC, name ASC`,
  )
  const out = rows.map((r) => ({
    slug: r.slug, name: r.name, icon: r.icon, color: r.color, sortOrder: Number(r.sort_order),
  }))
  // Boş dönerse önbelleğe yazma: migrate henüz koşmamış olabilir, bir sonraki
  // istek tekrar denesin.
  if (out.length > 0) cache = { at: Date.now(), rows: out }
  return out
}

/**
 * İstemciden gelen kategori parametresini kabul edilebilir bir değere indirger.
 * Bilinmeyen slug sessizce "tümü"ne düşer: bozuk bir bağlantı boş liste
 * göstermek yerine dünya sıralamasını gösterir.
 */
export async function resolveCategory(input: string | null | undefined): Promise<string | null> {
  if (!input || input === 'all') return null
  const cats = await listCategories()
  return cats.some((c) => c.slug === input) ? input : null
}

/** Yazma yolunda (teklif/checkout) kategori zorunlu ve geçerli olmalı. */
export async function requireCategory(input: string | null | undefined): Promise<string> {
  if (!input) return DEFAULT_CATEGORY
  const cats = await listCategories()
  return cats.some((c) => c.slug === input) ? input : DEFAULT_CATEGORY
}
