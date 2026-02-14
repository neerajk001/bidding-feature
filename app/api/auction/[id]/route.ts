import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { finalizeEndedAuctions } from '@/lib/auctions/finalizeEndedAuctions'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await finalizeEndedAuctions()

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Auction ID is required' }, { status: 400 })
    }

    const { data: auction, error } = await supabaseAdmin
      .from('auctions')
      .select(
        'id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment'
      )
      .eq('id', id)
      .single()

    if (error || !auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    const { data: highestBid } = await supabaseAdmin
      .from('bids')
      .select('amount, bidder:bidder_id(name)')
      .eq('auction_id', id)
      .order('amount', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { count } = await supabaseAdmin
      .from('bids')
      .select('id', { count: 'exact', head: true })
      .eq('auction_id', id)

    const { data: winner } = await supabaseAdmin
      .from('winners')
      .select('winning_amount, declared_at, bidder:bidder_id(name)')
      .eq('auction_id', id)
      .maybeSingle()

    const winningAmount = winner?.winning_amount ?? null
    const winnerBidder = winner?.bidder
    const winnerName = Array.isArray(winnerBidder) ? winnerBidder[0]?.name ?? null : (winnerBidder as any)?.name ?? null
    
    const highestBidder = highestBid?.bidder
    const highestBidderName = Array.isArray(highestBidder) ? highestBidder[0]?.name ?? null : (highestBidder as any)?.name ?? null
    
    const useWinner = auction.status === 'ended' && winningAmount !== null

    return NextResponse.json({
      ...auction,
      current_highest_bid: useWinner ? winningAmount : highestBid?.amount ?? null,
      highest_bidder_name: useWinner ? winnerName : highestBidderName,
      total_bids: count ?? 0,
      winner_name: winnerName,
      winning_amount: winningAmount,
      winner_declared_at: winner?.declared_at ?? null
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
