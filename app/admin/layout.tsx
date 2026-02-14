import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="admin-panel">
      {/* Admin Header */}
      <div className="admin-header">
        <div className="container admin-header-content">
          <div className="admin-logo">
            <h1 className="admin-title">
              🔧 Admin Panel
            </h1>
            <Link
              href="/admin/auctions"
              className="admin-nav-link"
            >
              Manage Auctions
            </Link>
          </div>
          <Link
            href="/"
            className="admin-nav-link"
          >
            ← View Public Site
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="admin-content">{children}</div>
    </div>
  )
}
