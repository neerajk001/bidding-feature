import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * API to send email OTP for verification
 * Rate limited to 3 attempts per hour per email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name } = body

    // Validate email
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if user already exists and is verified
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified, name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser && existingUser.email_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Email already verified. You can proceed to register for auctions.'
      })
    }

    // Rate limiting: Check recent OTP requests (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentOtps } = await supabaseAdmin
      .from('email_otps')
      .select('id')
      .eq('email', normalizedEmail)
      .gte('created_at', oneHourAgo)

    if (recentOtps && recentOtps.length >= 3) {
      return NextResponse.json(
        { error: 'Too many OTP requests. Please try again after 1 hour.' },
        { status: 429 }
      )
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()

    // Store OTP in database (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { error: insertError } = await supabaseAdmin
      .from('email_otps')
      .insert({
        email: normalizedEmail,
        otp_code: otpCode,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent
      })

    if (insertError) {
      console.error('Failed to store OTP:', insertError)
      return NextResponse.json(
        { error: 'Failed to generate OTP' },
        { status: 500 }
      )
    }

    // Send email via Resend
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: normalizedEmail,
        subject: 'Your Verification Code - Indu Heritage Auctions',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .container {
                  background: linear-gradient(135deg, #fff8ee, #f4e1c6);
                  border: 2px solid #8B4513;
                  border-radius: 12px;
                  padding: 40px;
                  text-align: center;
                }
                .logo {
                  font-size: 24px;
                  font-weight: 700;
                  color: #8B4513;
                  margin-bottom: 20px;
                }
                .otp-code {
                  font-size: 48px;
                  font-weight: 700;
                  color: #FF6B35;
                  letter-spacing: 8px;
                  margin: 30px 0;
                  padding: 20px;
                  background: white;
                  border-radius: 8px;
                  border: 2px solid #000;
                }
                .message {
                  color: #2a1a12;
                  margin: 20px 0;
                }
                .expiry {
                  color: #666;
                  font-size: 14px;
                  margin-top: 20px;
                }
                .footer {
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #ddd;
                  color: #999;
                  font-size: 12px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo">🏛️ Indu Heritage Auctions</div>
                <h1 style="color: #2a1a12; margin-bottom: 10px;">Verify Your Email</h1>
                <p class="message">
                  ${name ? `Hello ${name},<br><br>` : ''}
                  Enter this verification code to complete your registration:
                </p>
                <div class="otp-code">${otpCode}</div>
                <p class="expiry">⏰ This code expires in 10 minutes</p>
                <p class="message" style="margin-top: 30px; font-size: 14px;">
                  If you didn't request this code, please ignore this email.
                </p>
                <div class="footer">
                  © ${new Date().getFullYear()} Indu Heritage Auctions. All rights reserved.
                </div>
              </div>
            </body>
          </html>
        `,
      })
    } catch (resendError: any) {
      console.error('Resend error:', resendError)
      return NextResponse.json(
        { error: 'Failed to send verification email. Please check your email address.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: `Verification code sent to ${normalizedEmail}. Please check your inbox.`
    })

  } catch (error) {
    console.error('Send email OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
