import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import twilio from 'twilio'

/**
 * API to initiate OTP verification for a phone number
 * Uses Twilio Verify to send SMS OTP
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    // Validate required fields
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Normalize phone number format (should include country code)
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    // Check if user already exists and is verified
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified, name, email')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existingUser && existingUser.phone_verified) {
      return NextResponse.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Phone number already verified'
      })
    }

    // If user exists but not verified, or doesn't exist, they need OTP
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

    try {
      await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({ to: normalizedPhone, channel: 'sms' })
    } catch (twilioError: any) {
      console.error('Twilio error:', twilioError)
      
      // Handle specific Twilio errors
      if (twilioError.code === 60223) {
        return NextResponse.json(
          { 
            error: 'SMS delivery is not enabled in your Twilio Verify service. Please enable SMS in Twilio Console.',
            details: 'Go to Twilio Console → Verify → Services → Your Service → Settings → Enable SMS channel'
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: twilioError.message || 'Failed to send OTP' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: 'Please verify your phone number with OTP'
    })

  } catch (error) {
    console.error('Send OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
