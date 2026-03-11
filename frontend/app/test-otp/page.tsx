'use client'

import { useState } from 'react'
import EmailOtpVerification from '@/components/auth/EmailOtpVerification'

export default function OTPTestPage() {
  const [verificationResult, setVerificationResult] = useState<{
    userId: string
    name: string
    email: string
    phone?: string
  } | null>(null)

  const handleVerificationSuccess = (userId: string, userInfo: { name: string; email: string; phone?: string }) => {
    const result = {
      userId,
      ...userInfo
    }
    setVerificationResult(result)
    alert(`✅ Success! User ID: ${userId}`)
  }

  const handleVerificationError = (error: string) => {
    alert(`❌ Error: ${error}`)
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--color-background)',
      padding: '2rem'
    }}>
      <div className="container" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          padding: '2rem',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)'
        }}>
          <h1 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>
            � Email Verification Test
          </h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Test email verification with Resend OTP.
          </p>
        </div>

        <EmailOtpVerification
          auctionId="test-auction"
          onVerificationComplete={handleVerificationSuccess}
          onError={handleVerificationError}
        />

        {verificationResult && (
          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'var(--color-success-bg)',
            border: '1px solid var(--color-success)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <h3 style={{ color: 'var(--color-success)', marginBottom: '1rem' }}>
              ✅ Verification Successful!
            </h3>
            <div style={{ 
              background: 'var(--color-background)', 
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'monospace',
              fontSize: '0.9rem'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>User ID:</strong>
                <div style={{ 
                  marginTop: '0.25rem',
                  color: 'var(--color-text-secondary)',
                  wordBreak: 'break-all'
                }}>
                  {verificationResult.userId}
                </div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Name:</strong>
                <div style={{ 
                  marginTop: '0.25rem',
                  color: 'var(--color-text-secondary)'
                }}>
                  {verificationResult.name}
                </div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Email:</strong>
                <div style={{ 
                  marginTop: '0.25rem',
                  color: 'var(--color-text-secondary)'
                }}>
                  {verificationResult.email}
                </div>
              </div>
              {verificationResult.phone && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Phone:</strong>
                  <div style={{ 
                    marginTop: '0.25rem',
                    color: 'var(--color-text-secondary)'
                  }}>
                    {verificationResult.phone}
                  </div>
                </div>
              )}
            </div>
            <div style={{ 
              marginTop: '1rem',
              padding: '1rem',
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem'
            }}>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>✅ Next Steps:</strong>
              </p>
              <ol style={{ marginLeft: '1.5rem', color: 'var(--color-text-secondary)' }}>
                <li>User is now verified in the database (email verified)</li>
                <li>You can register for any auction without re-verifying</li>
                <li>Test with: POST /api/register-bidder</li>
              </ol>
            </div>
          </div>
        )}

        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.9rem'
        }}>
          <h4 style={{ marginBottom: '1rem' }}>📱 Testing Tips:</h4>
          <ul style={{ 
            marginLeft: '1.5rem', 
            color: 'var(--color-text-secondary)',
            lineHeight: '1.6'
          }}>
            <li><strong>Phone Format:</strong> Include country code (e.g., +919876543210)</li>
            <li><strong>Test Numbers:</strong> Configure test numbers in Clerk to skip real SMS</li>
            <li><strong>Real SMS:</strong> Use your real phone number to receive the OTP</li>
            <li><strong>Errors:</strong> Check browser console for detailed error messages</li>
          </ul>

          <div style={{ 
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(249, 115, 22, 0.1)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(249, 115, 22, 0.3)'
          }}>
            <strong style={{ color: 'var(--color-primary)' }}>⚠️ Clerk Test Numbers:</strong>
            <p style={{ 
              marginTop: '0.5rem',
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem'
            }}>
              Configure test numbers in the Clerk dashboard to avoid real SMS charges.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
