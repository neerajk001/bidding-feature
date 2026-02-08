import { NextRequest, NextResponse } from 'next/server'

// ⚠️ THIS ENDPOINT IS DISABLED
// Use the web UI at /test-otp for real Firebase phone verification
// This ensures proper Firebase authentication flow

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'This test endpoint has been disabled',
      message: 'Please use the web UI at /test-otp for phone verification with Firebase',
      web_ui_url: '/test-otp',
      hint: 'Visit http://localhost:3001/test-otp to verify phone numbers'
    },
    { status: 410 } // 410 Gone - endpoint permanently removed
  )
}
  try {
    const body = await request.json()
    const { phone, otp, name, email } = body

    // Validate required fields
    if (!phone || !otp || !name || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, otp, name, email' },
        { status: 400 }
      )
    }

    // Check if this is a test phone number
    if (!TEST_PHONE_NUMBERS.includes(phone)) {
      return NextResponse.json(
        { 
          error: 'This endpoint only works with test phone numbers',
          test_numbers: TEST_PHONE_NUMBERS,
          hint: 'For real phone numbers, use the web UI at /test-otp'
        },
        { status: 400 }
      )
    }

    // Verify OTP
    if (otp !== TEST_OTP) {
      return NextResponse.json(
        { error: 'Invalid OTP. Test OTP is always: 123456' },
        { status: 401 }
      )
    }

    // OTP is correct, create/update user in database

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single()

    let userId: string

    if (existingUser) {
      // Update existing user
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          name,
          email,
          phone_verified: true,
          otp_verified_at: new Date().toISOString()
        })
        .eq('phone', phone)
        .select()
        .single()

      if (error) {
        console.error('Error updating user:', error)
        return NextResponse.json(
          { error: 'Failed to update user', details: error.message },
          { status: 500 }
        )
      }

      userId = data.id
    } else {
      // Create new user
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({
          name,
          email,
          phone,
          phone_verified: true,
          otp_verified_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating user:', error)
        return NextResponse.json(
          { error: 'Failed to create user', details: error.message },
          { status: 500 }
        )
      }

      userId = data.id
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      phone_verified: true,
      message: 'TEST: Phone number verified successfully',
      note: 'This is a test endpoint. For production, use Firebase client SDK.'
    })

  } catch (error: any) {
    console.error('Error in verify-test-otp:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
