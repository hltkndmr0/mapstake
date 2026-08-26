import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { resolveCategory } from '@/lib/categories'
import Share from '../Share'
import { shareView } from '../data'
import { shareMetadata } from '../meta'

export const revalidate = 60

type Props = { params: Promise<{ code: string; cat: string }> }

/**
 * Kategoriye özel paylaşım adresi.
 *
 * Bilinmeyen kategori 404 döner — sessizce "bütün kategoriler"e düşseydi
 * /t/TUR/uydurma adresi gerçek bir sayfa gibi görünür, paylaşıldığında da
 * kart başka bir yarışın liderini gösterirdi.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, cat } = await params
  const category = await resolveCategory(cat)
  if (!category) return { title: 'Not found' }
  return shareMetadata(await shareView(code, category))
}

export default async function TerritoryCategoryPage({ params }: Props) {
  const { code, cat } = await params
  const category = await resolveCategory(cat)
  if (!category) notFound()
  const view = await shareView(code, category)
  if (!view) notFound()
  return <Share view={view} />
}
