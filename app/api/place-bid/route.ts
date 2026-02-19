import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { auction_id, bidder_id, amount, size } = body

    if (!auction_id || !bidder_id || !amount) {
      return NextResponse.json(
        { error: 'All fields are required: auction_id, bidder_id, amount' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Call the PostgreSQL function 'place_bid' which handles:
    // 1. Locking the auction row (concurrency safety)
    // 2. Validating status and time
    // 3. Checking against current highest bid
    // 4. Inserting the new bid
    // 5. Extending auction time (soft close) if needed
    // All in a single transaction.

    const { data, error } = await supabaseAdmin.rpc('place_bid', {
      p_auction_id: auction_id,
      p_bidder_id: bidder_id,
      p_amount: amount,
      p_size: size || null
    })

    if (error) {
      console.error('RPC Error:', error)
      return NextResponse.json(
        { error: 'Failed to place bid', details: error.message },
        { status: 500 }
      )
    }

    // The RPC function returns a JSON object with success/error fields
    // cast data to any to access properties since RPC types might not be generated yet
    const result = data as any

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        bid_id: result.bid_id,
        amount: result.amount,
        created_at: result.created_at,
        message: 'Bid placed successfully',
        extended: result.extended,
        new_end_time: result.new_end_time
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
