'use client'

import { SignInButton, UserButton, useUser } from '@clerk/nextjs'
import { useEffect, useMemo, useState } from 'react'

interface PhoneOtpVerificationProps {
  onVerificationSuccess: (payload: {
    userId: string
    idToken: string
    name: string
    email: string
    phone: string
  }) => void
  onVerificationError?: (error: string) => void
  headline?: string
  supportingText?: string
}

export default function PhoneOtpVerification({
  onVerificationSuccess,
  onVerificationError,
  headline,
  supportingText
}: PhoneOtpVerificationProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [hasNotified, setHasNotified] = useState(false)

  const verifiedPhone = useMemo(() => {
    if (!user) return null
    const primary = user.primaryPhoneNumber
    if (primary?.verification?.status === 'verified') return primary
    return user.phoneNumbers.find((phoneNumber) => phoneNumber.verification?.status === 'verified') || null
  }, [user])

  const profilePayload = useMemo(() => {
    if (!user || !verifiedPhone) return null
    const name =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      'Verified bidder'
    const email = user.primaryEmailAddress?.emailAddress || ''
    return {
      userId: user.id,
      idToken: '',
      name,
      email,
      phone: verifiedPhone.phoneNumber
    }
  }, [user, verifiedPhone])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setHasNotified(false)
      return
    }
    if (!profilePayload) {
      if (onVerificationError && !hasNotified) {
        onVerificationError('Please verify your phone number to continue.')
      }
      setHasNotified(true)
      return
    }
    if (hasNotified) return
    onVerificationSuccess(profilePayload)
    setHasNotified(true)
  }, [isLoaded, isSignedIn, profilePayload, onVerificationError, onVerificationSuccess, hasNotified])

  return (
    <div className="card otp-card">
      <div className="otp-header">
        <h3>{headline || 'Verify your phone number'}</h3>
        <p>{supportingText || 'Sign in with your phone to verify your bidding profile.'}</p>
      </div>

      {!isLoaded ? (
        <div className="notice notice-info">Loading verification…</div>
      ) : !isSignedIn ? (
        <div className="stack">
          <SignInButton mode="modal">
            <button type="button" className="btn btn-primary">
              Continue with phone
            </button>
          </SignInButton>
          <p className="helper-text">
            We use Clerk to securely verify your phone number before bidding.
          </p>
        </div>
      ) : !verifiedPhone ? (
        <div className="stack">
          <div className="notice notice-info">
            Your phone number is not verified yet. Please complete verification in your account.
          </div>
          <UserButton userProfileMode="modal" />
        </div>
      ) : (
        <div className="notice notice-success">
          Phone verified. You can continue registration.
        </div>
      )}

      <div className="otp-footer">
        <p>By continuing, you agree to verify your phone with Clerk.</p>
      </div>
    </div>
  )
}
