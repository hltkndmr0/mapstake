import { NextResponse } from 'next/server'
import { recentActivity } from '@/lib/board'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ activity: await recentActivity(12) })
}
