import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { finalizeEndedAuctions } from '@/lib/auctions/finalizeEndedAuctions'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ product_id: string }> }
) {
  try {
    await finalizeEndedAuctions()

    const { product_id } = await params

    if (!product_id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const { data: auction, error } = await supabaseAdmin
      .from('auctions')
      .select(
        'id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment'
      )
      .eq('product_id', product_id)
      .eq('status', 'live')
      .single()

    if (error || !auction) {
      return NextResponse.json(
        { error: 'No live auction found for this product' },
        { status: 404 }
      )
    }

    const { data: highestBid } = await supabaseAdmin
      .from('bids')
      .select('amount, bidder:bidder_id(name)')
      .eq('auction_id', auction.id)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ...auction,
      current_highest_bid: highestBid?.amount ?? null,
      highest_bidder_name: highestBid?.bidder?.name ?? null
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
