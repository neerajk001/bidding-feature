import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { auth } from '@/lib/firebase/admin'

/**
 * API to verify OTP and create/update user
 * Receives Firebase ID token after client-side OTP verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { idToken, name, email, phone } = body

    // Validate required fields
    if (!idToken) {
      return NextResponse.json(
        { error: 'Firebase ID token is required' },
        { status: 400 }
      )
    }

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required' },
        { status: 400 }
      )
    }

    // Verify the Firebase ID token
    let decodedToken
    try {
      decodedToken = await auth.verifyIdToken(idToken)
    } catch (error) {
      console.error('Token verification failed:', error)
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Extract phone number from token
    const verifiedPhone = decodedToken.phone_number

    if (!verifiedPhone) {
      return NextResponse.json(
        { error: 'Phone number not found in token' },
        { status: 400 }
      )
    }

    // Normalize phone numbers for comparison
    const normalizedInputPhone = phone.startsWith('+') ? phone : `+${phone}`
    
    // Verify that the token's phone matches the provided phone
    if (verifiedPhone !== normalizedInputPhone) {
      return NextResponse.json(
        { error: 'Phone number mismatch' },
        { status: 400 }
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
      .eq('phone', verifiedPhone)
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
          phone: verifiedPhone,
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
