'use client'

import { useState, useEffect } from 'react'

interface EmailOtpVerificationProps {
  auctionId: string
  onVerificationComplete: (userId: string, userInfo: { name: string; email: string; phone?: string }) => void
  onError?: (error: string) => void
}

/**
 * Email OTP Verification Component
 * Two-step process: Send OTP → Verify OTP → Create verified user
 * One-time verification: Once verified, user can register for any auction
 */
export default function EmailOtpVerification({
  auctionId,
  onVerificationComplete,
  onError
}: EmailOtpVerificationProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'info' | 'otp'>('info')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('Please enter your name')
      setLoading(false)
      return
    }

    if (!email.trim()) {
      setError('Please enter your email address')
      setLoading(false)
      return
    }

    try {
      const checkResponse = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(),
          name: name.trim()
        })
      })

      const checkData = await checkResponse.json()

      if (checkData.verified) {
        // User already verified, proceed directly
        setSuccess('Email already verified! Redirecting...')
        setTimeout(() => {
          onVerificationComplete(checkData.user_id, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined
          })
        }, 1000)
        return
      }

      if (!checkResponse.ok) {
        throw new Error(
          checkData.error === 'Too many OTP requests. Please try again after 1 hour.'
            ? 'Too many requests. Please wait before requesting another code.'
            : (checkData.error || 'Failed to send verification code')
        )
      }

      setStep('otp')
      setSuccess(`Verification code sent to ${email.trim()}. Please check your inbox.`)
      setCooldown(60) // 60 second cooldown before resend
      
    } catch (err: any) {
      console.error('Error sending OTP:', err)
      const errorMessage = err.message || 'Failed to send verification code'
      setError(errorMessage)
      if (onError) onError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter the 6-digit verification code')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: otp.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      setSuccess('Email verified successfully!')
      
      // Call parent callback with user info
      setTimeout(() => {
        onVerificationComplete(data.user_id, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined
        })
      }, 500)

    } catch (err: any) {
      console.error('Error verifying OTP:', err)
      const errorMessage = err.message || 'Verification failed'
      setError(errorMessage)
      if (onError) onError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const resendOtp = async () => {
    if (cooldown > 0) return
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(),
          name: name.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code')
      }

      setSuccess('New verification code sent! Please check your inbox.')
      setCooldown(60)
    } catch (err: any) {
      console.error('Error resending OTP:', err)
      setError(err.message || 'Failed to resend verification code')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'info') {
    return (
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
          Verify Your Email
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Enter your details to receive a verification code via email.
        </p>

        {error && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '6px',
            color: '#c33'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            background: '#efe',
            border: '1px solid #cfc',
            borderRadius: '6px',
            color: '#3c3'
          }}>
            {success}
          </div>
        )}

        <form onSubmit={sendOtp}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Email Address *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.875rem' }}>
              Phone number is not verified, just collected for contact purposes
            </small>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: loading ? '#ccc' : '#FF6B35',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Sending...' : 'Send Verification Code'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
        Enter Verification Code
      </h2>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>
        We sent a 6-digit code to <strong>{email}</strong>
      </p>

      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '6px',
          color: '#c33'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#efe',
          border: '1px solid #cfc',
          borderRadius: '6px',
          color: '#3c3'
        }}>
          {success}
        </div>
      )}

      <form onSubmit={verifyOtp}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Verification Code *
          </label>
          <input
            type="text"
            value={otp}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 6)
              setOtp(value)
            }}
            placeholder="000000"
            maxLength={6}
            required
            autoFocus
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '1.5rem',
              letterSpacing: '0.5em',
              textAlign: 'center',
              fontWeight: '600'
            }}
          />
          <small style={{ display: 'block', marginTop: '0.5rem', color: '#666', fontSize: '0.875rem' }}>
            Code expires in 10 minutes
          </small>
        </div>

        <button
          type="submit"
          disabled={loading || otp.length !== 6}
          style={{
            width: '100%',
            padding: '0.875rem',
            background: (loading || otp.length !== 6) ? '#ccc' : '#FF6B35',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            marginBottom: '1rem'
          }}
        >
          {loading ? 'Verifying...' : 'Verify Email'}
        </button>

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={resendOtp}
            disabled={loading || cooldown > 0}
            style={{
              background: 'none',
              border: 'none',
              color: (cooldown > 0) ? '#999' : '#FF6B35',
              cursor: (cooldown > 0) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              textDecoration: 'underline'
            }}
          >
            {cooldown > 0 ? `Resend Code (${cooldown}s)` : 'Resend Code'}
          </button>
          <span style={{ margin: '0 1rem', color: '#ddd' }}>|</span>
          <button
            type="button"
            onClick={() => {
              setStep('info')
              setOtp('')
              setError('')
              setSuccess('')
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: '0.875rem',
              textDecoration: 'underline'
            }}
          >
            Change Email
          </button>
        </div>
      </form>
    </div>
  )
}
