import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { sendWinnerEmail } from './email.service'

export type FinalizeResult = {
  endedAuctionIds: string[]
  errors: string[]
}

export async function finalizeEndedAuctions(now: Date = new Date()): Promise<FinalizeResult> {
  const endedAuctionIds: string[] = []
  const errors: string[] = []
  const nowIso = now.toISOString()

  const { data: auctions, error } = await supabaseAdmin
    .from('auctions')
    .select('id, title, bidding_end_time, available_sizes')
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
      const availableSizes: string[] = Array.isArray(auction.available_sizes) ? auction.available_sizes : []
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

      if (bidSizesError) {
        errors.push(`Failed to load bid sizes for ${auction.id}: ${bidSizesError.message}`)
      } else {
        for (const row of bidSizes || []) {
          const trimmed = String((row as any).size ?? '').trim()
          if (trimmed) sizeSet.add(trimmed)
        }
      }

      const sizes = Array.from(sizeSet)

      if (sizes.length > 0) {
        for (const size of sizes) {
          const { data: highestBid, error: highestBidError } = await supabaseAdmin
            .from('bids')
            .select('amount, bidder_id')
            .eq('auction_id', auction.id)
            .eq('size', size)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (highestBidError) {
            errors.push(`Failed to calculate winner for ${auction.id} size ${size}: ${highestBidError.message}`)
            continue
          }

          const winningAmount = Number(highestBid?.amount ?? 0)
          if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
            const paymentDueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auction.id,
                  bidder_id: highestBid.bidder_id,
                  winning_amount: winningAmount,
                  declared_at: nowIso,
                  size,
                  payment_due_at: paymentDueAt,
                  payment_status: 'pending',
                  claim_token: crypto.randomUUID()
                },
                { onConflict: 'auction_id,size' }
              )

            if (winnerError) {
              errors.push(`Failed to save winner for ${auction.id} size ${size}: ${winnerError.message}`)
            }
          }
        }
      } else {
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
          const paymentDueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
          const { error: winnerError } = await supabaseAdmin
            .from('winners')
            .upsert(
              {
                auction_id: auction.id,
                bidder_id: highestBid.bidder_id,
                winning_amount: winningAmount,
                declared_at: nowIso,
                size: null,
                payment_due_at: paymentDueAt,
                payment_status: 'pending',
                claim_token: crypto.randomUUID()
              },
              { onConflict: 'auction_id,size' }
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

      // Send winner email(s) for winners not yet notified (pending, claim_token set)
      const { data: winnersToNotify } = await supabaseAdmin
        .from('winners')
        .select('id, bidder_id, winning_amount, claim_token, size')
        .eq('auction_id', auction.id)
        .eq('payment_status', 'pending')
        .not('claim_token', 'is', null)
        .is('winner_email_sent_at', null)

      if (winnersToNotify && winnersToNotify.length > 0) {
        for (const w of winnersToNotify) {
          const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single()
          const email = (bidder as any)?.email
          if (email && w.claim_token) {
            const sent = await sendWinnerEmail({
              to: email,
              winnerName: (bidder as any)?.name || 'Winner',
              auctionTitle: auction.title || 'Auction',
              winningAmount: Number(w.winning_amount),
              claimToken: w.claim_token,
              size: w.size,
              isEscalation: false
            })
            if (sent) {
              await supabaseAdmin.from('winners').update({ winner_email_sent_at: nowIso }).eq('id', w.id)
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to finalize auction ${auction.id}: ${String(err)}`)
    }
  }

  return { endedAuctionIds, errors }
}
