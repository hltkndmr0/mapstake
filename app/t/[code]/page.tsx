import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Share from './Share'
import { shareView } from './data'
import { shareMetadata } from './meta'

export const revalidate = 60

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return shareMetadata(await shareView(code))
}

// Kategorisiz adres: bölgenin bütün kategorileri tek listede.
// Kategoriye özel hâli /t/<kod>/<kategori> altında.
export default async function TerritoryPage({ params }: Props) {
  const { code } = await params
  const view = await shareView(code)
  if (!view) notFound()
  return <Share view={view} />
}
