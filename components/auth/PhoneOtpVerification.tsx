'use client'

import { useState } from 'react'
import { useEffect } from 'react'

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
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

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
        onVerificationSuccess({
          userId: checkData.user_id || '',
          idToken: '',
          name,
          email,
          phone: normalizedPhone
        })
        return
      }

      if (!checkResponse.ok) {
        throw new Error(checkData.error || 'Failed to send OTP')
      }

      setStep('otp')
      setCooldown(30)
      
    } catch (err: any) {
      console.error('Error sending OTP:', err)
      const errorMessage = err.message || 'Failed to send OTP'
      setError(errorMessage)
      if (onVerificationError) {
        onVerificationError(errorMessage)
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
      if (!otp || otp.length !== 6) {
        throw new Error('Please enter a valid 6-digit OTP')
      }

      // Normalize phone number
      const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

      // Send to backend to create/update user
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: otp,
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
      onVerificationSuccess({
        userId: data.user_id || '',
        idToken: '',
        name,
        email,
        phone: normalizedPhone
      })

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
  }

  return (
    <div className="card otp-card">
      <div className="otp-header">
        <h3>{headline || 'Verify your phone number'}</h3>
        <p>{supportingText || 'A one-time OTP keeps every bid verified and fair.'}</p>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {step === 'phone' ? (
        <form onSubmit={sendOtp} className="stack">
          <div>
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+919999999999"
            />
            <span className="helper-text">Include country code (e.g., +91 for India)</span>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="stack">
          <div>
            <label htmlFor="otp">Enter OTP</label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              className="otp-input"
              placeholder="000000"
            />
            <span className="helper-text">Enter the 6-digit code sent to {phone}</span>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          <button type="button" onClick={resendOtp} disabled={loading} className="btn btn-outline">
            Resend OTP
          </button>
        </form>
      )}
      {cooldown > 0 && (
        <div className="helper-text">You can request a new OTP in {cooldown}s.</div>
      )}

      <div className="otp-footer">
        <p>By verifying, you agree to receive SMS messages.</p>
        <p>Standard rates may apply.</p>
      </div>
    </div>
  )
}
