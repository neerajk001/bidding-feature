'use client'

import { Suspense, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
      <div className="admin-card" style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.75rem', fontSize: '2rem', color: '#FF6B35' }}>🔧 Admin Sign-In</h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1rem' }}>
          Sign in with your approved Google account to access the admin panel.
        </p>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => signIn('google', { callbackUrl })}
          style={{ width: '100%', fontSize: '1.05rem', padding: '1rem' }}
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
