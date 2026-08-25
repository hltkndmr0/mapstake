// X/Twitter kartı OG görselinin aynısı. Next yapılandırma alanlarını statik
// olarak okuduğu için (re-export edilmişse göremiyor) burada tekrar yazılıyor;
// görselin kendisi tek kaynaktan geliyor.
export { default, alt } from './opengraph-image'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'
export const revalidate = 60
