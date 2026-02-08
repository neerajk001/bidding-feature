import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get auction details
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Get highest bid
    const { data: bids } = await supabase
      .from('bids')
      .select('amount, bidder_id, bidders(id, name)')
      .eq('auction_id', id)
      .order('amount', { ascending: false })
      .limit(1)

    // Get total bid count
    const { count: totalBids } = await supabase
      .from('bids')
      .select('*', { count: 'exact', head: true })
      .eq('auction_id', id)

    const highestBid = bids && bids.length > 0 ? bids[0] : null

    // Handle bidder relation - typically single object but sometimes returned as array by Supabase types
    const rawBidder = highestBid?.bidders as any
    const bidder = rawBidder ? (Array.isArray(rawBidder) ? rawBidder[0] : rawBidder) : null

    return NextResponse.json({
      success: true,
      auction: {
        ...auction,
        highest_bid: highestBid?.amount || null,
        total_bids: totalBids || 0,
        highest_bidder: bidder ? {
          id: bidder.id,
          name: bidder.name
        } : null
      }
    })
  } catch (error) {
    console.error('Error fetching auction:', error)
    return NextResponse.json(
      { error: 'Failed to fetch auction' },
      { status: 500 }
    )
  }
}
