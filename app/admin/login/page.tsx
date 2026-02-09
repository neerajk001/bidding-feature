'use client'

import { useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/auctions'

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl)
    }
  }, [status, router, callbackUrl])

  return (
    <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1 style={{ marginBottom: '0.75rem' }}>Admin sign-in</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
        Sign in with your approved Google account to access the admin panel.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => signIn('google', { callbackUrl })}
      >
        Continue with Google
      </button>
    </div>
  )
}
