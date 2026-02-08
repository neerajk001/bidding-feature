import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

/**
 * GET /api/auction/active
 * 
 * Returns the currently active auction based on server time.
 * Priority: live auction > registration-open auction
 * 
 * Response:
 * - If active auction exists: { exists: true, auction_id, phase, cta }
 * - If no active auction: { exists: false }
 */
export async function GET() {
  try {
    // Get current server time
    const now = new Date()

    // Query all published auctions with time fields
    const { data: auctions, error } = await supabase
      .from('auctions')
      .select('id, registration_end_time, bidding_start_time, bidding_end_time')
      .eq('status', 'live')
      .order('bidding_start_time', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch auctions' },
        { status: 500 }
      )
    }

    if (!auctions || auctions.length === 0) {
      return NextResponse.json({ exists: false })
    }

    // Find live auction (highest priority)
    const liveAuction = auctions.find(auction => {
      const biddingStart = new Date(auction.bidding_start_time)
      const biddingEnd = new Date(auction.bidding_end_time)
      return now >= biddingStart && now <= biddingEnd
    })

    if (liveAuction) {
      return NextResponse.json({
        exists: true,
        auction_id: liveAuction.id,
        phase: 'live',
        cta: 'Place Bid'
      })
    }

    // Find registration-open auction (lower priority)
    const registrationAuction = auctions.find(auction => {
      const registrationEnd = new Date(auction.registration_end_time)
      const biddingStart = new Date(auction.bidding_start_time)
      return now < registrationEnd && now < biddingStart
    })

    if (registrationAuction) {
      return NextResponse.json({
        exists: true,
        auction_id: registrationAuction.id,
        phase: 'registration',
        cta: 'Register Now'
      })
    }

    // No active auction found
    return NextResponse.json({ exists: false })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
