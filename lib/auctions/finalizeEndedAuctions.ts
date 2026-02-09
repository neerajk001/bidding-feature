import { supabaseAdmin } from '@/lib/supabase/admin'

type FinalizeResult = {
  endedAuctionIds: string[]
  errors: string[]
}

export async function finalizeEndedAuctions(now: Date = new Date()): Promise<FinalizeResult> {
  const endedAuctionIds: string[] = []
  const errors: string[] = []
  const nowIso = now.toISOString()

  const { data: auctions, error } = await supabaseAdmin
    .from('auctions')
    .select('id, bidding_end_time')
    .eq('status', 'live')
    .lt('bidding_end_time', nowIso)
    .order('bidding_end_time', { ascending: true })

  if (error) {
    errors.push(`Failed to load ended auctions: ${error.message}`)
    return { endedAuctionIds, errors }
  }

  if (!auctions || auctions.length === 0) {
    return { endedAuctionIds, errors }
  }

  for (const auction of auctions) {
    try {
      const { data: highestBid, error: highestBidError } = await supabaseAdmin
        .from('bids')
        .select('amount, bidder_id')
        .eq('auction_id', auction.id)
        .order('amount', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (highestBidError) {
        errors.push(`Failed to calculate winner for ${auction.id}: ${highestBidError.message}`)
        continue
      }

      const winningAmount = Number(highestBid?.amount ?? 0)
      if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
        const { error: winnerError } = await supabaseAdmin
          .from('winners')
          .upsert(
            {
              auction_id: auction.id,
              bidder_id: highestBid.bidder_id,
              winning_amount: winningAmount,
              declared_at: nowIso
            },
            { onConflict: 'auction_id' }
          )

        if (winnerError) {
          errors.push(`Failed to save winner for ${auction.id}: ${winnerError.message}`)
          continue
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('auctions')
        .update({ status: 'ended' })
        .eq('id', auction.id)

      if (updateError) {
        errors.push(`Failed to mark auction ended for ${auction.id}: ${updateError.message}`)
        continue
      }

      endedAuctionIds.push(auction.id)
    } catch (err) {
      errors.push(`Failed to finalize auction ${auction.id}: ${String(err)}`)
    }
  }

  return { endedAuctionIds, errors }
}
