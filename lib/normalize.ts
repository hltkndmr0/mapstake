// Link normalizasyonu — TEK kaynak, yalnız sunucuda otorite.
// İstemci bunu sadece önizleme için çağırabilir; kaydedilen değer daima
// sunucunun ürettiğidir.

export type Mode = 'product' | 'social'

export type NormalizeOk = {
  ok: true
  mode: Mode
  /** Kimlik anahtarı: 'ornek.com' | 'x.com/kullanici' */
  canonicalKey: string
  /** Kullanıcıya gösterilen kısa etiket */
  displayUrl: string
  /** Gerçek hedef (utm eklenmeden önce) */
  outboundUrl: string
  /** Favicon/ikon için kök alan adı */
  iconDomain: string
}
export type NormalizeErr = { ok: false; error: string }
export type NormalizeResult = NormalizeOk | NormalizeErr

/** Davet/sohbet linkleri reklam hedefi olamaz. */
const BLOCKED_HOSTS = new Set([
  't.me', 'telegram.me', 'telegram.dog',
  'wa.me', 'api.whatsapp.com', 'chat.whatsapp.com',
  'discord.gg', 'discord.com', 'discordapp.com',
  'signal.me', 'signal.group',
  'm.me', 'messenger.com',
])

/** Product modunda girilirse Social sekmesine yönlendiriyoruz. */
const SOCIAL_HOSTS = new Set([
  'x.com', 'twitter.com', 'instagram.com', 'github.com',
  'youtube.com', 'youtu.be',
])

/** Nihai hedefi gizleyen kısaltıcılar. */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly',
  'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
])

const STRIP_PREFIXES = ['www.', 'm.', 'mobile.']

function parse(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    // Kimlik bilgisi taşıyan URL kabul edilmez.
    if (u.username || u.password) return null
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u
  } catch {
    return null
  }
}

function cleanHost(hostname: string): string {
  let h = hostname.toLowerCase()
  if (h.endsWith('.')) h = h.slice(0, -1) // trailing dot
  for (const p of STRIP_PREFIXES) {
    if (h.startsWith(p) && h.length > p.length + 3) { h = h.slice(p.length); break }
  }
  return h
}

/** Yerel/özel adresler — SSRF ve anlamsız hedef koruması. */
function isPrivateHost(h: string): boolean {
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split('.').map(Number)
    if (p.some((n) => n > 255)) return true
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
    if (p[0] === 192 && p[1] === 168) return true
    if (p[0] === 169 && p[1] === 254) return true // link-local + cloud metadata
    return false
  }
  if (h.startsWith('[') || h.includes(':')) return true // IPv6 literal
  return false
}

// --------------------------------------------------------------- product
function normalizeProduct(raw: string): NormalizeResult {
  const u = parse(raw)
  if (!u) return { ok: false, error: 'Enter a valid URL.' }

  const host = cleanHost(u.hostname)
  if (!host.includes('.')) return { ok: false, error: 'Enter a valid domain.' }
  if (isPrivateHost(host)) return { ok: false, error: 'That address is not accepted.' }
  if (BLOCKED_HOSTS.has(host)) return { ok: false, error: 'Chat and invite links are not accepted.' }
  if (SHORTENERS.has(host)) return { ok: false, error: 'Shortened links are not accepted — enter the real URL.' }
  if (SOCIAL_HOSTS.has(host)) return { ok: false, error: 'That is a social profile — use the Social profile tab.' }

  // Uygulama mağazaları: uygulama kimliği anlamlı, korunur.
  if (host === 'apps.apple.com' || host === 'itunes.apple.com') {
    const m = u.pathname.match(/\/(id\d+)/)
    if (m) {
      const key = `apps.apple.com/${m[1]}`
      return { ok: true, mode: 'product', canonicalKey: key, displayUrl: key, outboundUrl: `https://${key}`, iconDomain: 'apps.apple.com' }
    }
  }
  if (host === 'play.google.com') {
    const id = u.searchParams.get('id')
    if (id && /^[\w.]+$/.test(id)) {
      const key = `play.google.com/${id}`
      return { ok: true, mode: 'product', canonicalKey: key, displayUrl: key, outboundUrl: `https://play.google.com/store/apps/details?id=${id}`, iconDomain: 'play.google.com' }
    }
  }

  // Normal ürün: path/query/fragment atılır, kimlik = alan adı.
  return { ok: true, mode: 'product', canonicalKey: host, displayUrl: host, outboundUrl: `https://${host}`, iconDomain: host }
}

// ---------------------------------------------------------------- social
type SocialRule = {
  hosts: string[]
  canonicalHost: string
  handle: RegExp
  /** Profil olmayan rotalar (post, video, ayarlar...) */
  reserved: Set<string>
  allowRepo?: boolean
}

const SOCIAL_RULES: SocialRule[] = [
  {
    hosts: ['x.com', 'twitter.com'],
    canonicalHost: 'x.com',
    handle: /^[a-z0-9_]{1,15}$/,
    reserved: new Set(['i', 'home', 'status', 'search', 'explore', 'notifications', 'messages', 'settings', 'intent', 'share', 'compose']),
  },
  {
    hosts: ['instagram.com'],
    canonicalHost: 'instagram.com',
    handle: /^[a-z0-9_.]{1,30}$/,
    reserved: new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct']),
  },
  {
    hosts: ['github.com'],
    canonicalHost: 'github.com',
    handle: /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/,
    reserved: new Set(['features', 'pricing', 'topics', 'trending', 'collections', 'events', 'sponsors', 'settings', 'orgs', 'login', 'marketplace', 'explore']),
    allowRepo: true,
  },
]

function normalizeSocial(raw: string): NormalizeResult {
  const trimmed = raw.trim().replace(/^@/, '')
  const u = parse(trimmed)
  if (!u) return { ok: false, error: 'Enter a valid profile URL.' }

  const host = cleanHost(u.hostname)
  if (BLOCKED_HOSTS.has(host)) return { ok: false, error: 'Chat and invite links are not accepted.' }

  const segments = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s))

  // YouTube: @handle, /channel/UC..., /c/..., /user/...
  if (host === 'youtube.com') {
    let key: string | null = null
    if (segments[0]?.startsWith('@') && /^@[\w.-]{2,30}$/.test(segments[0])) key = segments[0]
    else if (['channel', 'c', 'user'].includes(segments[0]) && segments[1]) key = `${segments[0]}/${segments[1]}`
    if (!key) return { ok: false, error: 'Enter a YouTube channel profile (single videos are not accepted).' }
    const full = `youtube.com/${key}`
    return { ok: true, mode: 'social', canonicalKey: full, displayUrl: full, outboundUrl: `https://www.${full}`, iconDomain: 'youtube.com' }
  }

  const rule = SOCIAL_RULES.find((r) => r.hosts.includes(host))
  if (!rule) return { ok: false, error: 'Supported profiles: X, Instagram, GitHub, YouTube.' }

  const handle = (segments[0] || '').toLowerCase()
  if (!handle) return { ok: false, error: 'No profile name found.' }
  if (rule.reserved.has(handle)) return { ok: false, error: 'That is not a profile URL.' }
  if (!rule.handle.test(handle)) return { ok: false, error: 'That profile name is not valid.' }

  // GitHub'da kullanıcı veya kullanıcı/repo kabul; derin rotalar reddedilir.
  if (rule.allowRepo && segments.length > 1) {
    const repo = segments[1]
    if (segments.length > 2) return { ok: false, error: 'Only user or user/repo URLs are accepted.' }
    if (!/^[\w.-]{1,100}$/.test(repo)) return { ok: false, error: 'That repo name is not valid.' }
    const key = `github.com/${handle}/${repo}`
    return { ok: true, mode: 'social', canonicalKey: key, displayUrl: key, outboundUrl: `https://${key}`, iconDomain: 'github.com' }
  }
  if (!rule.allowRepo && segments.length > 1) {
    return { ok: false, error: 'Enter a profile URL, not a single post.' }
  }

  const key = `${rule.canonicalHost}/${handle}`
  return { ok: true, mode: 'social', canonicalKey: key, displayUrl: key, outboundUrl: `https://${key}`, iconDomain: rule.canonicalHost }
}

export function normalize(raw: string, mode: Mode): NormalizeResult {
  if (!raw || raw.trim().length === 0) return { ok: false, error: 'URL cannot be empty.' }
  if (raw.length > 500) return { ok: false, error: 'URL is too long.' }
  return mode === 'social' ? normalizeSocial(raw) : normalizeProduct(raw)
}

/** Dışa giden linke kaynak etiketi ekler. */
export function withUtm(outboundUrl: string, source: string): string {
  try {
    const u = new URL(outboundUrl)
    u.searchParams.set('utm_source', source)
    return u.toString()
  } catch {
    return outboundUrl
  }
}
