import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    // Get all bidders with their auction info
    const { data: bidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select(`
        id,
        name,
        phone,
        email,
        auction_id,
        created_at,
        auction:auctions(title, product_id, status)
      `)
      .order('created_at', { ascending: false })

    if (biddersError) throw biddersError

    // Get bid counts and highest bids for each bidder
    const biddersWithStats = await Promise.all(
      (bidders || []).map(async (bidder) => {
        // Get bid count
        const { count: bidsCount } = await supabaseAdmin
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('bidder_id', bidder.id)

        // Get highest bid
        const { data: highestBidData } = await supabaseAdmin
          .from('bids')
          .select('amount')
          .eq('bidder_id', bidder.id)
          .order('amount', { ascending: false })
          .limit(1)
          .single()

        return {
          ...bidder,
          registered_at: bidder.created_at,
          bids_count: bidsCount || 0,
          highest_bid: highestBidData?.amount || null
        }
      })
    )

    return NextResponse.json({
      success: true,
      bidders: biddersWithStats
    })
  } catch (error: any) {
    console.error('Bidders API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch bidders',
        message: error.message 
      },
      { status: 500 }
    )
  }
}
