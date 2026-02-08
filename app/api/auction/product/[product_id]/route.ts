import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ product_id: string }> }
) {
    try {
        const { product_id } = await params

        // Find auction by product_id
        const { data: auction, error: auctionError } = await supabase
            .from('auctions')
            .select('*')
            .eq('product_id', product_id)
            .single()

        if (auctionError || !auction) {
            return NextResponse.json(
                { error: 'Auction not found' },
                { status: 404 }
            )
        }

        // Get highest bid for this auction
        const { data: bids, error: bidsError } = await supabase
            .from('bids')
            .select('amount, bidders(name)')
            .eq('auction_id', auction.id)
            .order('amount', { ascending: false })
            .limit(1)

        if (bidsError) {
            console.error('Error fetching bids:', bidsError)
        }

        const currentHighestBid = bids && bids.length > 0 ? bids[0].amount : null
        const highestBidderName = bids && bids.length > 0 && bids[0].bidders ? (bids[0].bidders as any).name : null

        // Return clean response
        return NextResponse.json({
            id: auction.id,
            product_id: auction.product_id,
            title: auction.title,
            status: auction.status,
            min_increment: auction.min_increment,
            registration_end_time: auction.registration_end_time,
            bidding_start_time: auction.bidding_start_time,
            bidding_end_time: auction.bidding_end_time,
            banner_image: auction.banner_image,
            current_highest_bid: currentHighestBid,
            highest_bidder_name: highestBidderName
        })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
