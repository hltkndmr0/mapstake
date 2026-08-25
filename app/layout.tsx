import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import './globals.css'
import { BRAND, siteUrl } from '@/lib/brand'

// Modern reklam paneli tipografisi: geometrik/teknik display + nötr gövde.
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: `${BRAND.pitch} Countries and states are sold separately. ${BRAND.legalNote}`,
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: '/' },
  openGraph: { title: BRAND.name, description: BRAND.pitch, type: 'website', siteName: BRAND.name },
  twitter: { card: 'summary_large_image', title: BRAND.name, description: BRAND.pitch },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
