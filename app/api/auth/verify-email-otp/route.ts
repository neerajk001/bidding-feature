import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * API to verify email OTP and create/update user
 * One-time verification: Once verified, user can register for any auction
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, name, email, phone } = body

    // Validate required fields
    if (!code || !email) {
      return NextResponse.json(
        { error: 'Verification code and email are required' },
        { status: 400 }
      )
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Find the OTP record
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
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 401 }
      )
    }

    // Check if OTP is expired (10 minutes)
    const now = new Date()
    const expiresAt = new Date(otpRecord.expires_at)

    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 401 }
      )
    }

    // Check attempt limit (max 5 attempts per OTP)
    if (otpRecord.attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please request a new code.' },
        { status: 429 }
      )
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from('email_otps')
      .update({ verified: true })
      .eq('id', otpRecord.id)

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .maybeSingle()

    let userId

    if (existingUser) {
      // Update existing user to mark as verified
      const updateData: any = {
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        name,
      }

      // Update phone if provided (not verified, just stored)
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
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        )
      }

      userId = updatedUser.id
    } else {
      // Create new verified user
      const insertData: any = {
        name,
        email: normalizedEmail,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        phone_verified: false, // Keep for backward compatibility
      }

      // Add phone if provided (not verified, just stored)
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
      email_verified: true,
      message: 'Email verified successfully! You can now register for auctions.'
    })

  } catch (error: any) {
    console.error('Verify email OTP error:', error)

    // Handle unique constraint violations
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
