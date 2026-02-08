import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

// Public API - Lists only live auctions for end users
export async function GET() {
  try {
    const { data: auctions, error } = await supabase
      .from('auctions')
      .select('id, title, product_id, status, bidding_start_time, bidding_end_time, banner_image, min_increment')
      .eq('status', 'live')
      .order('bidding_start_time', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch auctions' },
        { status: 500 }
      )
    }

    // For each auction, get the current highest bid
    const auctionsWithBids = await Promise.all(
      (auctions || []).map(async (auction) => {
        const { data: bids } = await supabase
          .from('bids')
          .select('amount')
          .eq('auction_id', auction.id)
          .order('amount', { ascending: false })
          .limit(1)

        return {
          ...auction,
          current_highest_bid: bids && bids.length > 0 ? bids[0].amount : null
        }
      })
    )

    return NextResponse.json({ auctions: auctionsWithBids })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
