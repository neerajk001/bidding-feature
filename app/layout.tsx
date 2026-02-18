import './globals.css'
import AuthProvider from '@/components/providers/AuthProvider'
import { Unna, Sora } from 'next/font/google'

const unna = Unna({
  subsets: ['latin'],
  variable: '--font-unna',
  weight: ['400', '700'],
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  weight: ['100', '200', '300', '400', '500', '600', '700', '800'],
})

export const metadata = {
  title: 'Indu Heritage Auctions',
  description: 'Cozy, premium womenswear auctions with verified bidding',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${unna.variable} ${sora.variable}`}>
      <body className="font-body bg-[#F9F5F0] text-[#2D2420]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
