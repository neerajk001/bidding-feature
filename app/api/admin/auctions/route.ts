import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch auctions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ auctions })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    const {
      title,
      product_id,
      min_increment,
      registration_end_time,
      bidding_start_time,
      bidding_end_time,
      status
    } = body

    if (!title || !product_id || !min_increment || !registration_end_time ||
      !bidding_start_time || !bidding_end_time || !status) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['draft', 'live', 'ended']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be draft, live, or ended' },
        { status: 400 }
      )
    }

    // Validate min_increment is a positive number
    if (typeof min_increment !== 'number' || min_increment <= 0) {
      return NextResponse.json(
        { error: 'Minimum increment must be a positive number' },
        { status: 400 }
      )
    }

    // Convert datetime-local strings to ISO format for Supabase
    const registrationEndUTC = new Date(registration_end_time).toISOString()
    const biddingStartUTC = new Date(bidding_start_time).toISOString()
    const biddingEndUTC = new Date(bidding_end_time).toISOString()

    // Validate time logic
    const regEnd = new Date(registrationEndUTC)
    const bidStart = new Date(biddingStartUTC)
    const bidEnd = new Date(biddingEndUTC)

    if (regEnd >= bidStart) {
      return NextResponse.json(
        { error: 'Registration must end before bidding starts' },
        { status: 400 }
      )
    }

    if (bidStart >= bidEnd) {
      return NextResponse.json(
        { error: 'Bidding start time must be before end time' },
        { status: 400 }
      )
    }

    // Insert into Supabase using admin client
    const { data, error } = await supabaseAdmin
      .from('auctions')
      .insert({
        title,
        product_id,
        min_increment,
        registration_end_time: registrationEndUTC,
        bidding_start_time: biddingStartUTC,
        bidding_end_time: biddingEndUTC,
        status
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create auction', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, auction: data },
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
