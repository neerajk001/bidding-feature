import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { finalizeEndedAuctions } from '@/lib/auctions/finalizeEndedAuctions'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Auction ID is required' }, { status: 400 })
    }

    // Call the PostgreSQL function 'get_auction_details'
    // This function:
    // 1. Fetches all auction fields
    // 2. Checks if the auction has ended but is still marked 'live'. If so, it finalizes it (Lazy Finalization).
    // 3. returns the current highest bid, total bids, and winner info if applicable.
    // All in one efficient query.

    const { data, error } = await supabaseAdmin.rpc('get_auction_details', {
      p_auction_id: id
    })

    if (error) {
      // If the error message indicates "Auction not found" (from our RPC), return 404
      if (error.message.includes('Auction not found')) {
        return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
      }
      console.error('RPC Error fetching auction:', error)
      return NextResponse.json({ error: 'Failed to load auction details' }, { status: 500 })
    }

    // The RPC returns a JSON object directly.
    // Ensure we handle the case where the RPC itself returns an error object inside the JSON
    // (though in our SQL we throw exceptions which Supabase catches as `error`)

    if (!data) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
    }

    return NextResponse.json(
      data,
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
