import { supabaseAdmin } from '@/lib/supabase/admin'
import { finalizeEndedAuctions } from '@/lib/auctions/finalizeEndedAuctions'

export async function getAuctions(includeEnded: boolean = false) {
    try {
        await finalizeEndedAuctions()

        const statuses = includeEnded ? ['live', 'ended'] : ['live']

        const { data: auctions, error } = await supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment')
            .in('status', statuses)
            .order('bidding_start_time', { ascending: false })

        if (error) {
            console.error('Supabase error:', error)
            return []
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
                const winnerName = winner?.bidder?.name ?? null
                const displayAmount = winningAmount ?? highestBid?.amount ?? null
                const displayName = winnerName ?? highestBid?.bidder?.name ?? null

                const now = new Date().toISOString()
                const isExpired = auction.status === 'live' && auction.bidding_end_time < now
                const status = isExpired ? 'ended' : auction.status

                return {
                    ...auction,
                    status,
                    current_highest_bid: displayAmount,
                    highest_bidder_name: displayName,
                    total_bids: count ?? 0,
                    winner_name: winnerName,
                    winning_amount: winningAmount,
                    winner_declared_at: winner?.declared_at ?? null,
                    min_increment: auction.min_increment ?? 0
                }
            })
        )

        return auctionsWithBids
    } catch (error) {
        console.error('getAuctions error:', error)
        return []
    }
}

export async function getActiveAuctionState() {
    try {
        const now = new Date().toISOString()

        const { data: auctions, error } = await supabaseAdmin
            .from('auctions')
            .select('id, registration_end_time, bidding_start_time, bidding_end_time')
            .eq('status', 'live')
            .order('bidding_start_time', { ascending: false })

        if (error || !auctions || auctions.length === 0) {
            return { exists: false }
        }

        const liveAuction = auctions.find(auction => {
            // Logic from API
            // If live: now >= start && now <= end
            // However, the original code had a bug or check: `now >= auction.bidding_start_time`
            // Wait, in real world, live starts at start_time.
            return now >= auction.bidding_start_time && now <= auction.bidding_end_time
        })

        if (liveAuction) {
            return {
                exists: true,
                auction_id: liveAuction.id,
                phase: 'live' as const,
                cta: 'Place Bid'
            }
        }

        const registrationAuction = auctions.find(auction => {
            // Registration open: now < reg_end && now < start
            return now < auction.registration_end_time && now < auction.bidding_start_time
        })

        if (registrationAuction) {
            return {
                exists: true,
                auction_id: registrationAuction.id,
                phase: 'registration' as const,
                cta: 'Register Now'
            }
        }

        return { exists: false }
    } catch (error) {
        console.error('getActiveAuctionState error:', error)
        return { exists: false }
    }
}

export async function getAuctionDetail(id: string) {
    try {
        const { data: auction, error } = await supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, min_increment')
            .eq('id', id)
            .single()

        if (error || !auction) {
            return null
        }

        // Reuse logic or simplify
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

        // If ended, get winner
        let winner = null
        if (auction.status === 'ended') {
            const { data } = await supabaseAdmin
                .from('winners')
                .select('winning_amount, declared_at, bidder:bidder_id(name)')
                .eq('auction_id', auction.id)
                .maybeSingle()
            winner = data
        }

        return {
            ...auction,
            current_highest_bid: winner?.winning_amount ?? highestBid?.amount ?? null,
            highest_bidder_name: winner?.bidder?.name ?? highestBid?.bidder?.name ?? null,
            total_bids: count ?? 0,
            winner_name: winner?.bidder?.name ?? null,
            winning_amount: winner?.winning_amount ?? null,
            winner_declared_at: winner?.declared_at ?? null,
            min_increment: auction.min_increment ?? 0
        }

    } catch (e) {
        console.error('getAuctionDetail error', e)
        return null
    }
}
