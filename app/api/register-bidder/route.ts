import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required', requires_verification: true },
        { status: 401 }
      )
    }

    const clerkUser = await currentUser()
    if (!clerkUser) {
      return NextResponse.json(
        { error: 'Authentication required', requires_verification: true },
        { status: 401 }
      )
    }

    const verifiedPhone =
      clerkUser.primaryPhoneNumber?.verification?.status === 'verified'
        ? clerkUser.primaryPhoneNumber
        : clerkUser.phoneNumbers.find((phoneNumber) => phoneNumber.verification?.status === 'verified') ||
          null

    if (!verifiedPhone) {
      return NextResponse.json(
        {
          error: 'Phone number not verified',
          requires_verification: true,
          message: 'Please verify your phone number with Clerk before registering'
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { auction_id, name: bodyName, email: bodyEmail } = body

    const name =
      clerkUser.fullName ||
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
      bodyName ||
      ''
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress ||
      bodyEmail ||
      ''
    const phone = verifiedPhone.phoneNumber

    // Validate required fields
    if (!auction_id) {
      return NextResponse.json(
        { error: 'Auction ID is required' },
        { status: 400 }
      )
    }

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Complete your Clerk profile (name, email, and verified phone)' },
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

    // --- CLERK VERIFIED USER LOGIC ---
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`
    let userRecordId: string | null = null

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(`email.eq.${email},phone.eq.${normalizedPhone}`)
      .maybeSingle()

    if (existingUser?.id) {
      userRecordId = existingUser.id
      await supabaseAdmin
        .from('users')
        .update({
          name,
          email,
          phone: normalizedPhone,
          phone_verified: true,
          otp_verified_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
    } else {
      const { data: newUser, error: insertUserError } = await supabaseAdmin
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

      if (insertUserError) {
        return NextResponse.json(
          { error: 'Failed to create user record', details: insertUserError.message },
          { status: 500 }
        )
      }

      userRecordId = newUser.id
    }
    // --------------------------

    // Check for duplicate registration
    let query = supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('auction_id', auction_id)

    // Check by user_id OR phone to prevent duplicates
    if (userRecordId) {
      query = query.or(`phone.eq.${normalizedPhone},user_id.eq.${userRecordId}`)
    } else {
      query = query.eq('phone', normalizedPhone)
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
      phone: normalizedPhone,
      email
    }

    if (userRecordId) {
      bidderData.user_id = userRecordId
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
