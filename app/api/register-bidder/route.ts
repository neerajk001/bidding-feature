import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { auction_id, name, phone, email } = body

    // Validate required fields
    if (!auction_id || !name || !phone || !email) {
      return NextResponse.json(
        { error: 'All fields are required: auction_id, name, phone, email' },
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

    // Check if auction exists
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, registration_end_time')
      .eq('id', auction_id)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Check if registration is still open (UTC comparison)
    const now = new Date()
    const registrationEnd = new Date(auction.registration_end_time)

    if (now > registrationEnd) {
      return NextResponse.json(
        { error: 'Registration period has ended' },
        { status: 400 }
      )
    }

    // --- UNIFIED USER LOGIC WITH EMAIL VERIFICATION ---
    let userId = null
    let userVerified = false

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim()

    // Attempt to find existing user by email
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser) {
      userId = existingUser.id
      userVerified = existingUser.email_verified || false

      // Check if user is verified
      if (!userVerified) {
        return NextResponse.json(
          {
            error: 'Email not verified',
            requires_verification: true,
            message: 'Please verify your email address before registering for auctions'
          },
          { status: 403 }
        )
      }
    } else {
      // New user must verify email first
      return NextResponse.json(
        {
          error: 'Email not verified',
          requires_verification: true,
          message: 'Please verify your email address before registering for auctions'
        },
        { status: 403 }
      )
    }
    // --------------------------

    // Check for duplicate registration
    let query = supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('auction_id', auction_id)

    // Check by user_id OR phone to prevent duplicates
    if (userId) {
      query = query.or(`phone.eq.${phone},user_id.eq.${userId}`)
    } else {
      query = query.eq('phone', phone)
    }

    const { data: existingBidder } = await query.maybeSingle()

    if (existingBidder) {
      return NextResponse.json(
        { error: 'You are already registered for this auction' },
        { status: 409 }
      )
    }

    // Insert bidder
    const bidderData: any = {
      auction_id,
      name,
      phone,
      email
    }

    if (userId) {
      bidderData.user_id = userId
    }

    const { data: newBidder, error: insertError } = await supabaseAdmin
      .from('bidders')
      .insert(bidderData)
      .select('id')
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to register bidder', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        bidder_id: newBidder.id,
        message: 'Successfully registered for auction'
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
