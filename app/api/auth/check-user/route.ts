import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * API to check if a user's phone is already verified
 * Used to skip OTP verification for returning users
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, email } = body

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Phone or email is required' },
        { status: 400 }
      )
    }

    // Normalize phone number
    const normalizedPhone = phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null

    // Build query
    let query = supabaseAdmin
      .from('users')
      .select('id, phone_verified, name, email, phone')

    if (normalizedPhone && email) {
      query = query.or(`phone.eq.${normalizedPhone},email.eq.${email}`)
    } else if (normalizedPhone) {
      query = query.eq('phone', normalizedPhone)
    } else if (email) {
      query = query.eq('email', email)
    }

    const { data: user } = await query.maybeSingle()

    if (user && user.phone_verified) {
      return NextResponse.json({
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

    return NextResponse.json({
      success: true,
      verified: false,
      requires_verification: true
    })

  } catch (error) {
    console.error('Check user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
