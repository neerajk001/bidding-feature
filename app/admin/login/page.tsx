'use client'

import { Suspense, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminStyles, cn } from '@/lib/admin-styles'

function LoginForm() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/admin'

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl)
    }
  }, [status, router, callbackUrl])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className={cn(adminStyles.card, 'max-w-[520px] text-center')}>
        <h1 className="mb-3 text-3xl text-orange-500">🔧 Admin Sign-In</h1>
        <p className="text-gray-600 mb-8 text-base">
          Sign in with your approved Google account to access the admin panel.
        </p>
        <button
          type="button"
          className={cn(adminStyles.btn, adminStyles.btnPrimary, 'w-full text-lg py-4')}
          onClick={() => signIn('google', { callbackUrl })}
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
