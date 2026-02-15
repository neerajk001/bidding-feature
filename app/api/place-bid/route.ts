import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { auction_id, bidder_id, amount } = body

    // Validate required fields
    if (!auction_id || !bidder_id || !amount) {
      return NextResponse.json(
        { error: 'All fields are required: auction_id, bidder_id, amount' },
        { status: 400 }
      )
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Get auction details
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, status, min_increment, base_price, bidding_start_time, bidding_end_time')
      .eq('id', auction_id)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Check if auction status is live
    if (auction.status !== 'live') {
      return NextResponse.json(
        { error: 'Auction is not live' },
        { status: 400 }
      )
    }

    // Check if current time is within bidding window (UTC)
    const now = new Date()
    const biddingStart = new Date(auction.bidding_start_time)
    const biddingEnd = new Date(auction.bidding_end_time)

    if (now < biddingStart) {
      return NextResponse.json(
        { error: 'Bidding has not started yet' },
        { status: 400 }
      )
    }

    if (now > biddingEnd) {
      return NextResponse.json(
        { error: 'Bidding has ended' },
        { status: 400 }
      )
    }

    // Verify bidder is registered for this auction
    const { data: bidder, error: bidderError } = await supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('id', bidder_id)
      .eq('auction_id', auction_id)
      .single()

    if (bidderError || !bidder) {
      return NextResponse.json(
        { error: 'Bidder not registered for this auction' },
        { status: 403 }
      )
    }

    // Get current highest bid
    const { data: highestBidData, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('amount')
      .eq('auction_id', auction_id)
      .order('amount', { ascending: false })
      .limit(1)
      .single()

    const currentHighestBid = highestBidData ? highestBidData.amount : 0

    // Validate bid amount
    // If there are no bids yet (currentHighestBid = 0), check against base_price
    // If there are existing bids, check against min_increment
    let minimumBid: number
    let errorMessage: string

    if (currentHighestBid === 0) {
      // First bid: must meet base_price if set, otherwise any positive amount
      if (auction.base_price && auction.base_price > 0) {
        minimumBid = auction.base_price
        errorMessage = `First bid must be at least ₹${minimumBid.toFixed(2)} (base price)`
      } else {
        minimumBid = auction.min_increment
        errorMessage = `First bid must be at least ₹${minimumBid.toFixed(2)}`
      }
    } else {
      // Subsequent bids: must be current highest + min_increment
      minimumBid = currentHighestBid + auction.min_increment
      errorMessage = `Bid must be at least ₹${minimumBid.toFixed(2)}`
    }

    if (amount < minimumBid) {
      return NextResponse.json(
        {
          error: errorMessage,
          current_highest_bid: currentHighestBid,
          min_increment: auction.min_increment,
          base_price: auction.base_price,
          minimum_required_bid: minimumBid
        },
        { status: 400 }
      )
    }

    // --- ANTI-SNIPING (SOFT CLOSE) LOGIC ---
    const SOFT_CLOSE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
    const SOFT_CLOSE_EXTENSION_MS = 5 * 60 * 1000 // 5 minutes

    const timeLeft = biddingEnd.getTime() - now.getTime()

    if (timeLeft < SOFT_CLOSE_THRESHOLD_MS) {
      const newEndTime = new Date(now.getTime() + SOFT_CLOSE_EXTENSION_MS)

      const { error: extendError } = await supabaseAdmin
        .from('auctions')
        .update({ bidding_end_time: newEndTime.toISOString() })
        .eq('id', auction_id)

      if (extendError) {
        console.error('Failed to extend auction time:', extendError)
      } else {
        console.log(`Auction ${auction_id} extended to ${newEndTime.toISOString()}`)
      }
    }
    // ---------------------------------------

    // Insert or Update the bid
    // Check if the user already has a bid (to update instead of create new row)
    const { data: existingBid } = await supabaseAdmin
      .from('bids')
      .select('id')
      .eq('auction_id', auction_id)
      .eq('bidder_id', bidder_id)
      .maybeSingle()

    let resultData;
    let resultError;

    if (existingBid) {
      // Update existing bid
      const { data, error } = await supabaseAdmin
        .from('bids')
        .update({
          amount: amount,
          created_at: new Date().toISOString() // Update time so it shows as latest
        })
        .eq('id', existingBid.id)
        .select('id, created_at')
        .single()

      resultData = data
      resultError = error
    } else {
      // Insert new bid
      const { data, error } = await supabaseAdmin
        .from('bids')
        .insert({
          auction_id,
          bidder_id,
          amount
        })
        .select('id, created_at')
        .single()

      resultData = data
      resultError = error
    }

    if (resultError) {
      console.error('Bid operation error:', resultError)
      return NextResponse.json(
        { error: 'Failed to place bid', details: resultError.message },
        { status: 500 }
      )
    }

    if (!resultData) {
      return NextResponse.json(
        { error: 'Failed to retrieve bid data' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        bid_id: resultData.id,
        amount: amount,
        created_at: resultData.created_at,
        message: existingBid ? 'Bid updated successfully' : 'Bid placed successfully'
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
