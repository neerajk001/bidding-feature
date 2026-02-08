import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: auctionId } = await params

    // Get auction details
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .single()

    if (auctionError || !auction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // Get all registered bidders for this auction
    const { data: bidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select('*')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })

    if (biddersError) {
      console.error('Error fetching bidders:', biddersError)
    }

    // Get all bids for this auction with bidder info using FK join
    const { data: bids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select(`
        id,
        amount,
        created_at,
        bidder_id,
        auction_id,
        bidders!fk_bids_bidder (
          id,
          name,
          phone,
          email
        )
      `)
      .eq('auction_id', auctionId)
      .order('amount', { ascending: false })

    if (bidsError) {
      console.error('Error fetching bids:', bidsError)
      // Fallback: fetch bids without join if FK join fails
      const { data: simpleBids } = await supabaseAdmin
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .order('amount', { ascending: false })
      
      // Manually join bidder info
      const bidsWithBidderInfo = simpleBids?.map(bid => {
        const bidder = bidders?.find(b => b.id === bid.bidder_id)
        return {
          ...bid,
          bidders: bidder ? {
            id: bidder.id,
            name: bidder.name,
            phone: bidder.phone,
            email: bidder.email
          } : null
        }
      }) || []
      
      const currentHighestBid = simpleBids && simpleBids.length > 0
        ? Math.max(...simpleBids.map(b => b.amount))
        : null

      // Calculate highest bid for each bidder
      const biddersWithHighestBid = bidders?.map(bidder => {
        const bidderBids = simpleBids?.filter(bid => bid.bidder_id === bidder.id) || []
        const highestBid = bidderBids.length > 0 
          ? Math.max(...bidderBids.map(b => b.amount))
          : null
        
        return {
          ...bidder,
          highest_bid: highestBid
        }
      }) || []

      return NextResponse.json({
        auction,
        bidders: biddersWithHighestBid,
        bids: bidsWithBidderInfo,
        current_highest_bid: currentHighestBid
      })
    }

    const currentHighestBid = bids && bids.length > 0
      ? Math.max(...bids.map(b => b.amount))
      : null

    // Calculate highest bid for each bidder
    const biddersWithHighestBid = bidders?.map(bidder => {
      const bidderBids = bids?.filter(bid => bid.bidder_id === bidder.id) || []
      const highestBid = bidderBids.length > 0 
        ? Math.max(...bidderBids.map(b => b.amount))
        : null
      
      return {
        ...bidder,
        highest_bid: highestBid
      }
    }) || []

    return NextResponse.json({
      auction,
      bidders: biddersWithHighestBid,
      bids: bids || [],
      current_highest_bid: currentHighestBid
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: auctionId } = await params
    const body = await request.json()

    // Extract updateable fields
    const {
      title,
      product_id,
      min_increment,
      registration_end_time,
      bidding_start_time,
      bidding_end_time,
      status
    } = body

    // 1. Check if auction exists
    const { data: existingAuction, error: checkError } = await supabaseAdmin
      .from('auctions')
      .select('id, status')
      .eq('id', auctionId)
      .single()

    if (checkError || !existingAuction) {
      return NextResponse.json(
        { error: 'Auction not found' },
        { status: 404 }
      )
    }

    // 2. Prevent editing critical details if auction is not draft (optional logic, can stay flexible)
    // For now we allow editing everything, but status changes should be validated

    const updateData: any = {}
    if (title) updateData.title = title
    if (product_id) updateData.product_id = product_id
    if (min_increment) updateData.min_increment = parseFloat(min_increment)
    if (registration_end_time) updateData.registration_end_time = new Date(registration_end_time).toISOString()
    if (bidding_start_time) updateData.bidding_start_time = new Date(bidding_start_time).toISOString()
    if (bidding_end_time) updateData.bidding_end_time = new Date(bidding_end_time).toISOString()
    if (status) updateData.status = status

    const { data: updatedAuction, error: updateError } = await supabaseAdmin
      .from('auctions')
      .update(updateData)
      .eq('id', auctionId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update auction', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, auction: updatedAuction })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: auctionId } = await params

    // 1. Check constraints - usually can't delete if there are bids
    // For now we just delete. If FK constraints exist, this might fail unless cascading.
    // Assuming we want to force delete for admin convenience

    const { error: deleteError } = await supabaseAdmin
      .from('auctions')
      .delete()
      .eq('id', auctionId)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete auction', details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
