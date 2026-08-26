import manifest from './flag-manifest.json'

/**
 * Ülke bayrakları. Dosyalar `npm run flags` ile public/flags altına kopyalanır,
 * eşleme (ülke kodu -> iso2) derleme anında import edilir.
 *
 * İki farklı kod alanı var ve ikisi de gelir:
 *   - ülke kodu:  'TUR'  (territories.code, Natural Earth)
 *   - alt birim:  'TR-34' (ön ek ISO2)
 * Tek bir fonksiyonun ikisini de çözmesi çağıran tarafta dallanmayı siler.
 */
const BY_CODE: Record<string, string> = manifest

// iso2 -> dosya adı. Alt birim kodundan ('TR-34') ülkeye çıkmak için gerekli;
// alt birim kaydında ülke kodu yok, yalnız ISO2 ön eki var.
const BY_ISO2: Record<string, string> = {}
for (const iso2 of Object.values(BY_CODE)) BY_ISO2[iso2.toUpperCase()] = iso2

/** Bayrağı olmayan ülkeler (tanınma durumu tartışmalı bölgeler) null döner. */
export function flagFile(code: string | null | undefined): string | null {
  if (!code) return null
  const direct = BY_CODE[code]
  if (direct) return direct
  // 'TR-34' -> 'TR', ayrıca doğrudan verilen ISO2 ('TR') de buradan çözülür.
  const iso2 = code.includes('-') ? code.split('-')[0] : code
  return BY_ISO2[iso2.toUpperCase()] ?? null
}

export function flagUrl(code: string | null | undefined): string | null {
  const file = flagFile(code)
  return file ? `/flags/${file}.svg` : null
}

export function hasFlag(code: string | null | undefined): boolean {
  return flagFile(code) !== null
}
