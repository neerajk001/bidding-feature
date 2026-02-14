import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { finalizeEndedAuctions } from '@/lib/auctions/finalizeEndedAuctions'

// Public API - Lists only live auctions for end users
export async function GET(request: NextRequest) {
  try {
    await finalizeEndedAuctions()

    const includeEnded = request.nextUrl.searchParams.get('includeEnded') === 'true'
    const statuses = includeEnded ? ['live', 'ended'] : ['live']

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment')
      .in('status', statuses)
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
        const { data: highestBid } = await supabaseAdmin
          .from('bids')
          .select('amount, bidder:bidder_id(name)')
          .eq('auction_id', auction.id)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { count } = await supabaseAdmin
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('auction_id', auction.id)

        const { data: winner } = auction.status === 'ended'
          ? await supabaseAdmin
            .from('winners')
            .select('winning_amount, declared_at, bidder:bidder_id(name)')
            .eq('auction_id', auction.id)
            .maybeSingle()
          : { data: null }

        const winningAmount = winner?.winning_amount ?? null
        const winnerName = Array.isArray(winner?.bidder) ? (winner.bidder[0] as any)?.name : (winner?.bidder as any)?.name ?? null
        const displayAmount = winningAmount ?? highestBid?.amount ?? null
        const displayName = winnerName ?? (Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as any)?.name : (highestBid?.bidder as any)?.name) ?? null

        return {
          ...auction,
          current_highest_bid: displayAmount,
          highest_bidder_name: displayName,
          total_bids: count ?? 0,
          winner_name: winnerName,
          winning_amount: winningAmount,
          winner_declared_at: winner?.declared_at ?? null
        }
      })
    )

    return NextResponse.json({ success: true, auctions: auctionsWithBids })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
