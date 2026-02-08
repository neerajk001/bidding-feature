import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-background)' }}>
      {/* Admin Header */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '1rem 0',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(8px)',
        background: 'rgba(18, 18, 18, 0.8)'
      }}>
        <div className="container" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              🔧 Admin Panel
            </h1>
            <Link
              href="/admin/auctions"
              className="btn btn-outline"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', border: 'none' }}
            >
              Manage Auctions
            </Link>
          </div>
          <Link
            href="/"
            className="btn btn-outline"
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          >
            ← View Public Site
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="container" style={{ padding: '2rem 2rem' }}>{children}</div>
    </div>
  )
}
