'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { status } = useSession()
  const isLoginPage = pathname === '/admin/login'

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (!isLoginPage && status === 'unauthenticated') {
      router.replace(`/admin/login?callbackUrl=${encodeURIComponent(pathname)}`)
    }
  }, [status, isLoginPage, pathname, router])

  // If it's the login page, render without sidebar
  if (isLoginPage) {
    return <>{children}</>
  }

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    )
  }

  // Show nothing while redirecting to login
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
          <div className="text-lg text-gray-600">Redirecting to login...</div>
        </div>
      </div>
    )
  }

  // Normal admin layout with sidebar (authenticated users only)
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16 lg:mt-0">
          {children}
        </div>
      </div>
    </div>
  )
}
