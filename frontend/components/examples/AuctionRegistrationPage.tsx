'use client'

import { useState } from 'react'
import PhoneOtpVerification from '@/components/auth/PhoneOtpVerification'

interface AuctionRegistrationPageProps {
  auctionId: string
  auctionTitle: string
}

/**
 * Example page showing how to integrate Clerk phone verification with auction registration
 * 
 * Flow:
 * 1. User verifies phone with Clerk (if not already verified)
 * 2. User is registered for the auction automatically
 * 3. User can proceed to place bids
 */
export default function AuctionRegistrationPage({
  auctionId,
  auctionTitle
}: AuctionRegistrationPageProps) {
  const [step, setStep] = useState<'verification' | 'success' | 'error'>('verification')
  const [bidderId, setBidderId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [userInfo, setUserInfo] = useState<{
    name: string
    email: string
    phone: string
  } | null>(null)

  /**
 * Called when user successfully verifies their phone via Clerk
   */
  const handleVerificationSuccess = async (payload: {
    userId: string
    idToken: string
    name: string
    email: string
    phone: string
  }) => {
    try {
      // Phone verified! Now check if already registered for this auction
      // If not, we'll need their info to register

      // For demo purposes, we'll show success
      // In production, you might auto-register them here
      setStep('success')
      
      // Example: Auto-register for auction
      // await registerForAuction(payload.userId)
      
    } catch (error) {
      console.error('Post-verification error:', error)
      setErrorMessage('Verification succeeded but registration failed')
      setStep('error')
    }
  }

  /**
   * Register the verified user for the auction
   */
  const registerForAuction = async (name: string, email: string, phone: string) => {
    try {
      const response = await fetch('/api/register-bidder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auctionId,
          name,
          email,
          phone
        })
      })

      const data = await response.json()

      if (data.success) {
        setBidderId(data.bidder_id)
        setUserInfo({ name, email, phone })
        setStep('success')
      } else if (data.requires_verification) {
        // Should not happen as we just verified
        setErrorMessage('Please complete phone verification first')
        setStep('error')
      } else {
        throw new Error(data.error || 'Registration failed')
      }
    } catch (error: any) {
      console.error('Registration error:', error)
      setErrorMessage(error.message || 'Failed to register for auction')
      setStep('error')
    }
  }

  /**
   * Handle verification errors
   */
  const handleVerificationError = (error: string) => {
    setErrorMessage(error)
  }

  /**
   * Reset and try again
   */
  const handleTryAgain = () => {
    setStep('verification')
    setErrorMessage('')
  }

  if (step === 'success') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-green-800 mb-4">
            Phone Verified Successfully!
          </h2>
          {bidderId && (
            <>
              <p className="text-lg text-gray-700 mb-4">
                You're registered for <strong>{auctionTitle}</strong>
              </p>
              <div className="bg-white rounded p-4 mb-6 text-left">
                <p className="text-sm text-gray-600 mb-2">Registration Details:</p>
                <p><strong>Name:</strong> {userInfo?.name}</p>
                <p><strong>Email:</strong> {userInfo?.email}</p>
                <p><strong>Phone:</strong> {userInfo?.phone}</p>
                <p><strong>Bidder ID:</strong> {bidderId}</p>
              </div>
            </>
          )}
          <p className="text-gray-600 mb-6">
            You can now place bids on this auction.
          </p>
          <div className="space-x-4">
            <button
              onClick={() => window.location.href = `/auction/${auctionId}`}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Go to Auction
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-3xl font-bold text-red-800 mb-4">
            Something Went Wrong
          </h2>
          <p className="text-lg text-gray-700 mb-6">
            {errorMessage}
          </p>
          <button
            onClick={handleTryAgain}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Register for Auction
          </h1>
          <p className="text-xl text-gray-600">
            {auctionTitle}
          </p>
          <p className="text-sm text-gray-500 mt-4">
            To participate in this auction, please verify your phone number.
          </p>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="font-semibold text-blue-900 mb-2">
            📱 One-Time Phone Verification
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Verify your phone number once with Clerk</li>
            <li>• No need to verify again for future auctions</li>
            <li>• You'll receive SMS confirmation when you win</li>
            <li>• Your information is kept secure</li>
          </ul>
        </div>

        {/* Clerk Phone Verification Component */}
        <PhoneOtpVerification
          onVerificationSuccess={handleVerificationSuccess}
          onVerificationError={handleVerificationError}
        />

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Having trouble? Contact support at support@example.com</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Example usage of this component in a page:
 * 
 * // app/auction/[id]/register/page.tsx
 * import AuctionRegistrationPage from '@/components/examples/AuctionRegistrationPage'
 * 
 * export default function RegisterPage({ params }: { params: { id: string } }) {
 *   return (
 *     <AuctionRegistrationPage
 *       auctionId={params.id}
 *       auctionTitle="Vintage Rolex Watch"
 *     />
 *   )
 * }
 */
