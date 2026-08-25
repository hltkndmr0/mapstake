/**
 * Aktivite akışındaki "5m ago" etiketleri.
 *
 * Ayrı dosyada duruyor çünkü bir kez sessizce bozuldu: SQLite döneminde
 * tarihler "2026-08-25 16:45:35" biçiminde, zaman dilimsiz geliyordu ve
 * fonksiyon sonuna "Z" ekliyordu. Postgres'e geçişte board.ts artık ISO+Z
 * döndürüyor, eklenen ikinci "Z" tarihi geçersiz kılıyor ve arayüzde
 * "NaNd ago" yazıyordu. Artık zaman dilimi yoksa ekleniyor.
 */
export function relTime(iso: string): string {
  const normalized = iso.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
  const then = new Date(hasZone ? normalized : `${normalized}Z`).getTime()
  if (!Number.isFinite(then)) return ''

  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
