import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import twilio from 'twilio'

/**
 * API to verify OTP and create/update user
 * Uses Twilio Verify to validate OTP
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, name, email, phone } = body

    // Validate required fields
    if (!code) {
      return NextResponse.json(
        { error: 'OTP code is required' },
        { status: 400 }
      )
    }

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required' },
        { status: 400 }
      )
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID

    if (!accountSid || !authToken || !verifyServiceSid) {
      return NextResponse.json(
        { error: 'Twilio credentials are not configured' },
        { status: 500 }
      )
    }

    const client = twilio(accountSid, authToken)

    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: normalizedPhone, code })

    if (verification.status !== 'approved') {
      return NextResponse.json(
        { error: 'Invalid or expired OTP' },
        { status: 401 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let userId

    if (existingUser) {
      // Update existing user to mark as verified
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
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        )
      }

      userId = updatedUser.id
    } else {
      // Create new verified user
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
        return NextResponse.json(
          { error: 'Failed to create user', details: createError.message },
          { status: 500 }
        )
      }

      userId = newUser.id
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      phone_verified: true,
      message: 'Phone number verified successfully'
    })

  } catch (error) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
