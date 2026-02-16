import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-black">
                🔧 Admin Panel
              </h1>
              <Link
                href="/admin"
                className="px-4 py-2 text-sm font-semibold text-black hover:text-orange-500 transition-colors"
              >
                Dashboard
              </Link>
            </div>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-semibold border border-black text-black rounded-md hover:bg-black hover:text-white transition-all"
            >
              ← View Public Site
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-10">{children}</div>
    </div>
  )
}
