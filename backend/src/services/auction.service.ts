import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { sendWinnerEmail } from './email.service'
import { buildPendingWinnerOffer, buildWinnerNotificationUpdate } from './winner-offer.service'

export type FinalizeResult = {
  endedAuctionIds: string[]
  errors: string[]
}

const FINALIZE_AUCTIONS_BATCH_LIMIT = 20
const WINNER_NOTIFY_BATCH_LIMIT = 50

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
    .limit(FINALIZE_AUCTIONS_BATCH_LIMIT)

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

      const sizes = Array.from(sizeSet)

      if (sizes.length > 0) {
        for (const size of sizes) {
          const { data: highestBid, error: highestBidError } = await supabaseAdmin
            .from('bids')
            .select('amount, bidder_id')
            .eq('auction_id', auction.id)
            .eq('size', size)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (highestBidError) {
            errors.push(`Failed to calculate winner for ${auction.id} size ${size}: ${highestBidError.message}`)
            continue
          }

          const winningAmount = Number(highestBid?.amount ?? 0)
          if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auction.id,
                  ...buildPendingWinnerOffer({
                    bidderId: highestBid.bidder_id,
                    winningAmount,
                    declaredAt: nowIso,
                    size,
                    claimToken: crypto.randomUUID(),
                    escalationDone: false
                  }),
                  forfeited_bidder_ids: []  // Fix #10: reset escalation history on re-finalize
                },
                { onConflict: 'auction_id,size' }
              )

            if (winnerError) {
              errors.push(`Failed to save winner for ${auction.id} size ${size}: ${winnerError.message}`)
            }
          } else {
            // Fix #9: log sizes with no bids so admin is aware the slot went unfilled
            console.log(`[AUCTION] No bids for auction ${auction.id} size ${size} — no winner declared`)
          }
        }
      } else {
        const { data: highestBid, error: highestBidError } = await supabaseAdmin
          .from('bids')
          .select('amount, bidder_id')
          .eq('auction_id', auction.id)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: true })
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
                ...buildPendingWinnerOffer({
                  bidderId: highestBid.bidder_id,
                  winningAmount,
                  declaredAt: nowIso,
                  size: null,
                  claimToken: crypto.randomUUID(),
                  escalationDone: false
                }),
                forfeited_bidder_ids: []  // Fix #10: reset escalation history on re-finalize
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
        .order('id', { ascending: true })
        .limit(WINNER_NOTIFY_BATCH_LIMIT)

      if (winnersToNotify && winnersToNotify.length > 0) {
        const bidderIds = Array.from(new Set(winnersToNotify.map((w: any) => String(w.bidder_id || '')).filter(Boolean)))
        const { data: biddersForNotify } = bidderIds.length > 0
          ? await supabaseAdmin
              .from('bidders')
              .select('id, name, email')
              .in('id', bidderIds)
          : { data: [] as any[] }
        const bidderMap = new Map<string, any>((biddersForNotify || []).map((b: any) => [String(b.id), b]))

        for (const w of winnersToNotify) {
          const claimAt = new Date().toISOString()
          const { data: claimedRow, error: claimErr } = await supabaseAdmin
            .from('winners')
            .update({ winner_email_sent_at: claimAt })
            .eq('id', w.id)
            .eq('payment_status', 'pending')
            .is('winner_email_sent_at', null)
            .select('id, bidder_id, winning_amount, claim_token, size')
            .maybeSingle()

          if (claimErr) {
            errors.push(`Failed to claim winner email slot for ${w.id}: ${claimErr.message}`)
            continue
          }

          if (!claimedRow) {
            continue
          }

          const cw = claimedRow as any
          const bidder = bidderMap.get(String(cw.bidder_id)) || null
          const email = (bidder as any)?.email
          if (email && cw.claim_token) {
            const sent = await sendWinnerEmail({
              to: email,
              winnerName: (bidder as any)?.name || 'Winner',
              auctionTitle: auction.title || 'Auction',
              winningAmount: Number(cw.winning_amount),
              claimToken: cw.claim_token,
              size: cw.size,
              isEscalation: false
            })
            if (sent) {
              await supabaseAdmin
                .from('winners')
                .update(buildWinnerNotificationUpdate())
                .eq('id', w.id)
                .eq('bidder_id', cw.bidder_id)
                .eq('winner_email_sent_at', claimAt)
            } else {
              await supabaseAdmin
                .from('winners')
                .update({ winner_email_sent_at: null })
                .eq('id', w.id)
                .eq('payment_status', 'pending')
                .eq('bidder_id', cw.bidder_id)
                .eq('winner_email_sent_at', claimAt)
            }
          } else {
            await supabaseAdmin
              .from('winners')
              .update({ winner_email_sent_at: null })
              .eq('id', w.id)
              .eq('payment_status', 'pending')
              .eq('bidder_id', cw.bidder_id)
              .eq('winner_email_sent_at', claimAt)
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to finalize auction ${auction.id}: ${String(err)}`)
    }
  }

  return { endedAuctionIds, errors }
}
