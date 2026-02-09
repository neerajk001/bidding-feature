import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import AuthProvider from '@/components/providers/AuthProvider'

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
    <html lang="en">
      <body>
        <ClerkProvider>
          <AuthProvider>{children}</AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
