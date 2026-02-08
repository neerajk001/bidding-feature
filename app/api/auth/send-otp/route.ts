import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * API to initiate OTP verification for a phone number
 * This uses Firebase Phone Auth on the client side
 * This endpoint just checks if user needs verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, name, email } = body

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
