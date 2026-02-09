import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
