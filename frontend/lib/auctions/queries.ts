import { supabaseAdmin } from '@/lib/supabase/admin'

type BidderRow = { name?: string } | { name?: string }[]
type WinnerRow = { size: string | null; winning_amount: number; bidder: BidderRow | BidderRow[]; declared_at: string | null }

export async function getAuctions(includeEnded: boolean = false) {
    try {
        // await finalizeEndedAuctions() (removed to prevent crashes, handled by lazy SQL now)

        const statuses = includeEnded ? ['live', 'ended'] : ['live']

        const { data: auctions, error } = await supabaseAdmin
            .from('auctions')
            .select('*')
            .in('status', statuses)
            .order('bidding_start_time', { ascending: true })

        if (error) {
            console.error('Supabase error fetching auctions:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            })
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

                const { count: registrationCount } = await supabaseAdmin
                    .from('bidders')
                    .select('id', { count: 'exact', head: true })
                    .eq('auction_id', auction.id)

                const { data: winners } = auction.status === 'ended'
                    ? await supabaseAdmin
                        .from('winners')
                        .select('winning_amount, declared_at, size, bidder:bidder_id(name)')
                        .eq('auction_id', auction.id)
                    : { data: null }

                const winner = winners && winners.length > 0 ? winners[0] : null
                const winningAmount = winner?.winning_amount ?? null
                const winnerName = Array.isArray(winner?.bidder) ? (winner.bidder[0] as BidderRow)?.name : (winner?.bidder as BidderRow)?.name
                const displayAmount = winningAmount ?? highestBid?.amount ?? null
                const displayName = winnerName ?? (Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as BidderRow)?.name : (highestBid?.bidder as BidderRow)?.name) ?? null

                const winners_by_size = winners && winners.length > 0 ? winners.map((w: WinnerRow) => ({
                    size: w.size,
                    winning_amount: w.winning_amount,
                    winner_name: Array.isArray(w.bidder) ? (w.bidder[0] as BidderRow)?.name : (w.bidder as BidderRow)?.name,
                    declared_at: w.declared_at
                })) : null

                const now = new Date().toISOString()
                const isExpired = auction.status === 'live' && auction.bidding_end_time < now
                const status = isExpired ? 'ended' : auction.status

                return {
                    ...auction,
                    status,
                    current_highest_bid: displayAmount,
                    highest_bidder_name: displayName,
                    total_bids: count ?? 0,
                    registration_count: registrationCount ?? 0,
                    winner_name: winnerName,
                    winning_amount: winningAmount,
                    winner_declared_at: winner?.declared_at ?? null,
                    winners_by_size,
                    min_increment: auction.min_increment ?? 0,
                    base_price: auction.base_price ?? null
                }
            })
        )

        return auctionsWithBids
    } catch (error: unknown) {
        const err = error as { message?: string; details?: string; hint?: string; code?: string; cause?: { code?: string } }
        console.error('getAuctions error:', {
            message: err?.message || 'Unknown error',
            details: err?.details || (error != null ? String(error) : ''),
            hint: err?.hint || '',
            code: err?.code || err?.cause?.code || ''
        })
        // Return empty array to allow page to render gracefully
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
            .order('bidding_start_time', { ascending: true })

        if (error || !auctions || auctions.length === 0) {
            return { exists: false }
        }

        // Picking the first live auction as the "Active" one.
        const activeAuction = auctions[0]

        // Determine phase based on time relative to start
        // If before start time, it's registration (or upcoming).
        // If after start time, it's properly live.
        const isBeforeStart = now < activeAuction.bidding_start_time

        if (isBeforeStart) {
            return {
                exists: true,
                auction_id: activeAuction.id,
                phase: 'registration' as const,
                cta: 'Register Now'
            }
        }

        // Default to live
        return {
            exists: true,
            auction_id: activeAuction.id,
            phase: 'live' as const,
            cta: 'Place Bid'
        }

    } catch (error: unknown) {
        const err = error as { message?: string; details?: string; code?: string; cause?: { code?: string } }
        console.error('getActiveAuctionState error:', {
            message: err?.message || 'Unknown error',
            details: err?.details || (error != null ? String(error) : ''),
            code: err?.code || err?.cause?.code || ''
        })
        return { exists: false }
    }
}

export async function getAuctionDetail(id: string) {
    try {
        const { data: auction, error } = await supabaseAdmin
            .from('auctions')
            .select('*')
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

        const { count: registrationCount } = await supabaseAdmin
            .from('bidders')
            .select('id', { count: 'exact', head: true })
            .eq('auction_id', auction.id)

        // If ended, get winners
        let winner = null
        let winners_by_size = null
        if (auction.status === 'ended') {
            const { data } = await supabaseAdmin
                .from('winners')
                .select('winning_amount, declared_at, size, bidder:bidder_id(name)')
                .eq('auction_id', auction.id)

            if (data && data.length > 0) {
                winner = data[0]
                winners_by_size = data.map((w: WinnerRow) => ({
                    size: w.size,
                    winning_amount: w.winning_amount,
                    winner_name: Array.isArray(w.bidder) ? (w.bidder[0] as BidderRow)?.name : (w.bidder as BidderRow)?.name,
                    declared_at: w.declared_at
                }))
            }
        }

        return {
            ...auction,
            current_highest_bid: winner?.winning_amount ?? highestBid?.amount ?? null,
            highest_bidder_name: (Array.isArray(winner?.bidder) ? (winner.bidder[0] as BidderRow)?.name : (winner?.bidder as BidderRow)?.name) ?? (Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as BidderRow)?.name : (highestBid?.bidder as BidderRow)?.name) ?? null,
            total_bids: count ?? 0,
            registration_count: registrationCount ?? 0,
            winner_name: Array.isArray(winner?.bidder) ? (winner.bidder[0] as BidderRow)?.name : (winner?.bidder as BidderRow)?.name,
            winning_amount: winner?.winning_amount ?? null,
            winner_declared_at: winner?.declared_at ?? null,
            winners_by_size,
            min_increment: auction.min_increment ?? 0,
            base_price: auction.base_price ?? null
        }

    } catch (error: unknown) {
        const err = error as { message?: string; details?: string; code?: string; cause?: { code?: string } }
        console.error('getAuctionDetail error:', {
            message: err?.message || 'Unknown error',
            details: err?.details || (error != null ? String(error) : ''),
            code: err?.code || err?.cause?.code || ''
        })
        return null
    }
}
