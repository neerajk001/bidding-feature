import './globals.css'
import AuthProvider from '@/components/providers/AuthProvider'

export const metadata = {
  title: 'Indu Heritage Auctions',
  description: 'Cozy, premium womenswear auctions with OTP verified bidding',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
