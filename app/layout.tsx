import './globals.css'

export const metadata = {
  title: 'Auction System Admin',
  description: 'Admin panel for auction management',
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
