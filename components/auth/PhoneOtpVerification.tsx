'use client'

import { useState } from 'react'
import { auth } from '@/lib/firebase/client'
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult 
} from 'firebase/auth'

interface PhoneOtpVerificationProps {
  onVerificationSuccess: (userId: string, idToken: string) => void
  onVerificationError?: (error: string) => void
}

export default function PhoneOtpVerification({
  onVerificationSuccess,
  onVerificationError
}: PhoneOtpVerificationProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)

  // Initialize reCAPTCHA
  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
          'expired-callback': () => {
            setError('reCAPTCHA expired. Please try again.')
          }
        }
      )
    }
  }

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate inputs
      if (!phone || !name || !email) {
        throw new Error('Please fill all fields')
      }

      // Normalize phone number
      const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

      // Check if phone needs verification
      const checkResponse = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, name, email })
      })

      const checkData = await checkResponse.json()

      if (checkData.verified) {
        // User already verified
        onVerificationSuccess(checkData.user_id, '')
        return
      }

      // Setup reCAPTCHA and send OTP
      setupRecaptcha()
      const appVerifier = (window as any).recaptchaVerifier
      
      const result = await signInWithPhoneNumber(auth, normalizedPhone, appVerifier)
      setConfirmationResult(result)
      setStep('otp')
      
    } catch (err: any) {
      console.error('Error sending OTP:', err)
      const errorMessage = err.message || 'Failed to send OTP'
      setError(errorMessage)
      if (onVerificationError) {
        onVerificationError(errorMessage)
      }
      
      // Reset reCAPTCHA on error
      if ((window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier.clear()
        ;(window as any).recaptchaVerifier = null
      }
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!confirmationResult) {
        throw new Error('Please request OTP first')
      }

      if (!otp || otp.length !== 6) {
        throw new Error('Please enter a valid 6-digit OTP')
      }

      // Verify OTP with Firebase
      const result = await confirmationResult.confirm(otp)
      
      // Get ID token
      const idToken = await result.user.getIdToken()

      // Normalize phone number
      const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

      // Send to backend to create/update user
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          name,
          email,
          phone: normalizedPhone
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      // Success!
      onVerificationSuccess(data.user_id, idToken)

    } catch (err: any) {
      console.error('Error verifying OTP:', err)
      const errorMessage = err.message || 'Invalid OTP'
      setError(errorMessage)
      if (onVerificationError) {
        onVerificationError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  const resendOtp = async () => {
    setOtp('')
    setError('')
    setStep('phone')
    setConfirmationResult(null)
    
    // Reset reCAPTCHA
    if ((window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier.clear()
      ;(window as any).recaptchaVerifier = null
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        Verify Your Phone Number
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {step === 'phone' ? (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+919999999999"
            />
            <p className="text-xs text-gray-500 mt-1">
              Include country code (e.g., +91 for India)
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label htmlFor="otp" className="block text-sm font-medium mb-1">
              Enter OTP
            </label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="000000"
            />
            <p className="text-xs text-gray-500 mt-1 text-center">
              Enter the 6-digit code sent to {phone}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          <button
            type="button"
            onClick={resendOtp}
            disabled={loading}
            className="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
          >
            Resend OTP
          </button>
        </form>
      )}

      {/* reCAPTCHA container */}
      <div id="recaptcha-container"></div>

      <div className="mt-6 text-xs text-gray-500 text-center">
        <p>By verifying, you agree to receive SMS messages.</p>
        <p className="mt-1">Standard rates may apply.</p>
      </div>
    </div>
  )
}
