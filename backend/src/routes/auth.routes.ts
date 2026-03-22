import express, { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { twilioClient, resend } from '../config/services'
import { env } from '../config/env'

const router = express.Router()

// Check user
router.post('/auth/check-user', async (req: Request, res: Response) => {
  try {
    const { phone, email } = req.body || {}

    if (!phone && !email) {
      return res.status(400).json({ error: 'Phone or email is required' })
    }

    const normalizedPhone = phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null

    let query = supabaseAdmin
      .from('users')
      .select('id, phone_verified, email_verified, name, email, phone')

    if (normalizedPhone && email) {
      query = query.or(`phone.eq.${normalizedPhone},email.eq.${email}`)
    } else if (normalizedPhone) {
      query = query.eq('phone', normalizedPhone)
    } else if (email) {
      query = query.eq('email', email)
    }

    const { data: user } = await query.maybeSingle()

    if (user && (user.phone_verified || user.email_verified)) {
      return res.json({
        success: true,
        verified: true,
        user_id: user.id,
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone
        }
      })
    }

    return res.json({
      success: true,
      verified: false,
      requires_verification: true
    })
  } catch (error) {
    console.error('Check user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Send phone OTP
router.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { phone } = body

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' })
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified, name, email')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existingUser && existingUser.phone_verified) {
      return res.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Phone number already verified'
      })
    }

    if (!twilioClient || !env.twilioAccountSid || !env.twilioAuthToken) {
      return res.status(500).json({ error: 'Twilio credentials are not configured' })
    }

    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID
    if (!verifyServiceSid) {
      return res.status(500).json({ error: 'Twilio Verify Service SID not configured' })
    }

    try {
      await twilioClient.verify.v2
        .services(verifyServiceSid)
        .verifications.create({ to: normalizedPhone, channel: 'sms' })
    } catch (twilioError: any) {
      console.error('Twilio error:', twilioError)

      if (twilioError.code === 60223) {
        return res.status(500).json({
          error: 'SMS delivery is not enabled in your Twilio Verify service. Please enable SMS in Twilio Console.',
          details: 'Go to Twilio Console → Verify → Services → Your Service → Settings → Enable SMS channel'
        })
      }

      return res.status(500).json({ error: twilioError.message || 'Failed to send OTP' })
    }

    return res.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: 'Please verify your phone number with OTP'
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Verify phone OTP
router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { code, name, email, phone } = body

    if (!code) {
      return res.status(400).json({ error: 'OTP code is required' })
    }

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required' })
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    if (!twilioClient || !env.twilioAccountSid || !env.twilioAuthToken) {
      return res.status(500).json({ error: 'Twilio credentials are not configured' })
    }

    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID
    if (!verifyServiceSid) {
      return res.status(500).json({ error: 'Twilio Verify Service SID not configured' })
    }

    const verification = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: normalizedPhone, code })

    if (verification.status !== 'approved') {
      return res.status(401).json({ error: 'Invalid or expired OTP' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let userId

    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          phone_verified: true,
          otp_verified_at: new Date().toISOString(),
          name,
          email
        })
        .eq('id', existingUser.id)
        .select('id')
        .single()

      if (updateError) {
        console.error('User update error:', updateError)
        return res.status(500).json({ error: 'Failed to update user' })
      }

      userId = updatedUser.id
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          name,
          email,
          phone: normalizedPhone,
          phone_verified: true,
          otp_verified_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (createError) {
        console.error('User creation error:', createError)
        return res.status(500).json({ error: 'Failed to create user', details: createError.message })
      }

      userId = newUser.id
    }

    return res.json({
      success: true,
      user_id: userId,
      phone_verified: true,
      message: 'Phone number verified successfully'
    })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Send email OTP
router.post('/auth/send-email-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { email, name, force_otp } = body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified, name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    const shouldForceOtp = force_otp === true || force_otp === 'true'

    if (existingUser && existingUser.email_verified && !shouldForceOtp) {
      return res.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Email already verified. You can proceed to register for auctions.'
      })
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentOtps } = await supabaseAdmin
      .from('email_otps')
      .select('id')
      .eq('email', normalizedEmail)
      .gte('created_at', oneHourAgo)

    if (recentOtps && recentOtps.length >= 3) {
      return res.status(429).json({ error: 'Too many OTP requests. Please try again after 1 hour.' })
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'

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
      return res.status(500).json({ error: 'Failed to generate OTP' })
    }

    if (resend) {
      try {
        await resend.emails.send({
          from: env.resendFromEmail || 'onboarding@resend.dev',
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
                  <div class="logo">🏺 Indu Heritage Auctions</div>
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
        console.log('Email sent successfully to:', normalizedEmail)
      } catch (resendError: any) {
        console.error('Resend error:', resendError)
        console.log('📧 Email failed but OTP stored. DEV MODE - OTP Code:', otpCode)
      }
    } else {
      console.log('📧 Resend not configured. DEV MODE - OTP Code:', otpCode)
    }

    return res.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: `Verification code sent to ${normalizedEmail}. Please check your inbox.`,
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: otpCode })
    })
  } catch (error) {
    console.error('Send email OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Verify email OTP
router.post('/auth/verify-email-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { code, name, email, phone } = body

    if (!code || !email) {
      return res.status(400).json({ error: 'Verification code and email are required' })
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('email_otps')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('otp_code', code)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpError || !otpRecord) {
      return res.status(401).json({ error: 'Invalid or expired verification code' })
    }

    const now = new Date()
    const expiresAt = new Date(otpRecord.expires_at)

    if (now > expiresAt) {
      return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' })
    }

    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ error: 'Too many verification attempts. Please request a new code.' })
    }

    await supabaseAdmin
      .from('email_otps')
      .update({ verified: true })
      .eq('id', otpRecord.id)

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .maybeSingle()

    let userId

    if (existingUser) {
      const updateData: any = {
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        name
      }

      if (phone) {
        updateData.phone = phone
      }

      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select('id')
        .single()

      if (updateError) {
        console.error('User update error:', updateError)
        return res.status(500).json({ error: 'Failed to update user' })
      }

      userId = updatedUser.id
    } else {
      const insertData: any = {
        name,
        email: normalizedEmail,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        phone_verified: false
      }

      if (phone) {
        insertData.phone = phone
      }

      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert(insertData)
        .select('id')
        .single()

      if (createError) {
        console.error('User creation error:', createError)
        return res.status(500).json({ error: 'Failed to create user', details: createError.message })
      }

      userId = newUser.id
    }

    return res.json({
      success: true,
      user_id: userId,
      email_verified: true,
      message: 'Email verified successfully! You can now register for auctions.'
    })
  } catch (error: any) {
    console.error('Verify email OTP error:', error)

    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Disabled test endpoint
router.post('/auth/verify-test-otp', async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'This test endpoint has been disabled',
    message: 'Please use the web UI at /test-otp for Clerk phone verification',
    web_ui_url: '/test-otp'
  })
})

export default router
