import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/categories'

// Kategori kümesi veritabanında; arayüz ikon ve rengi de buradan alır.
// Nadiren değişir, bu yüzden CDN'de bir dakika bekletilebilir.
export const revalidate = 60

export async function GET() {
  return NextResponse.json({ categories: await listCategories() })
}
