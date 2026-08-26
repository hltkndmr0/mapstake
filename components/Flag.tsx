import { flagUrl } from '@/lib/flags'

/**
 * Ülke bayrağı. Sunucuda da istemcide de aynı bileşen kullanılır.
 *
 * Bayrağı olmayan üç bölge var (tanınma durumu tartışmalı). Onlarda kırık
 * görsel yerine nötr bir yer tutucu çizilir — liste hizası bozulmaz.
 */
export default function Flag({
  code, size = 22, className = '',
}: {
  code: string | null | undefined
  size?: number
  className?: string
}) {
  const url = flagUrl(code)
  const style = { width: size, height: Math.round((size * 3) / 4) }

  if (!url) {
    return <span className={`flag flag-blank ${className}`} style={style} aria-hidden="true" />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`flag ${className}`}
      src={url}
      alt=""
      width={style.width}
      height={style.height}
      loading="lazy"
      decoding="async"
    />
  )
}
