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
      // Get auction sizes to determine if this is multi-size
      const { data: auctionData } = await supabaseAdmin
        .from('auctions')
        .select('available_sizes')
        .eq('id', auction.id)
        .single()

      const availableSizes = Array.isArray(auctionData?.available_sizes) ? auctionData?.available_sizes : []
      const sizeSet = new Set<string>()
      for (const s of availableSizes) {
        const trimmed = String(s ?? '').trim()
        if (trimmed) sizeSet.add(trimmed)
      }

      const { data: bidSizes, error: bidSizesError } = await supabaseAdmin
        .from('bids')
        .select('size')
        .eq('auction_id', auction.id)
        .not('size', 'is', null)

      if (!bidSizesError) {
        for (const row of bidSizes || []) {
          const trimmed = String((row as any).size ?? '').trim()
          if (trimmed) sizeSet.add(trimmed)
        }
      }

      const sizes = Array.from(sizeSet)
      const isMultiSize = sizes.length > 0

      if (isMultiSize) {
        // Handle multi-size auction - one winner per size
        for (const size of sizes) {
          const { data: highestBidForSize, error: bidError } = await supabaseAdmin
            .from('bids')
            .select('amount, bidder_id')
            .eq('auction_id', auction.id)
            .eq('size', size)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (bidError) {
            errors.push(`Failed to get bid for ${auction.id} size ${size}: ${bidError.message}`)
            continue
          }

          const winningAmount = Number(highestBidForSize?.amount ?? 0)
          if (highestBidForSize?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auction.id,
                  bidder_id: highestBidForSize.bidder_id,
                  winning_amount: winningAmount,
                  size: size,
                  declared_at: nowIso,
                  payment_due_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                  payment_status: 'pending'
                },
                { onConflict: 'auction_id,size', ignoreDuplicates: false }
              )

            if (winnerError) {
              errors.push(`Failed to save winner for ${auction.id} size ${size}: ${winnerError.message}`)
            }
          }
        }
      } else {
        // Handle single-size auction (original logic)
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
                size: null,
                declared_at: nowIso,
                payment_due_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                payment_status: 'pending'
              },
              { onConflict: 'auction_id,size', ignoreDuplicates: false }
            )

          if (winnerError) {
            errors.push(`Failed to save winner for ${auction.id}: ${winnerError.message}`)
            continue
          }
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
