import cron from 'node-cron'
import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { finalizeEndedAuctions } from './auction.service'
import { sendWinnerEmail } from './email.service'
import { buildPendingWinnerOffer, buildWinnerNotificationUpdate } from './winner-offer.service'

export type WinnerPaymentCheckResult = {
  notified: number
  marked_forfeited: number
  escalated: number
}

let activeRun: Promise<WinnerPaymentCheckResult> | null = null
let activeFinalizationRun: Promise<{ finalized: number; errors: string[] }> | null = null

export function initializeCronJobs() {
  // Ensure auction end finalization is no longer dependent on public API traffic.
  cron.schedule('* * * * *', async () => {
    try {
      await runAuctionFinalization('scheduler')
    } catch (error) {
      console.error('[CRON] Auction finalization failed:', error)
    }
  })

  cron.schedule('*/5 * * * *', async () => {
    try {
      await runWinnerPaymentCheck('scheduler')
    } catch (error) {
      console.error('[CRON] Winner payment check failed:', error)
    }
  })

  console.log('[CRON] Jobs initialized - auction finalization every 1 minute, winner checks every 5 minutes')
}

export async function runAuctionFinalization(trigger: string = 'manual'): Promise<{ finalized: number; errors: string[] }> {
  if (activeFinalizationRun) {
    console.log(`[CRON] Auction finalization already running, joining existing run (${trigger})`)
    return activeFinalizationRun
  }

  activeFinalizationRun = (async () => {
    const result = await finalizeEndedAuctions()
    const finalized = result.endedAuctionIds.length
    if (finalized > 0 || result.errors.length > 0) {
      console.log(
        `[CRON] Auction finalization (${trigger}): finalized=${finalized}, errors=${result.errors.length}`
      )
    }
    if (result.errors.length > 0) {
      console.error('[CRON] Auction finalization errors:', result.errors)
    }
    return { finalized, errors: result.errors }
  })().finally(() => {
    activeFinalizationRun = null
  })

  return activeFinalizationRun
}

export async function runWinnerPaymentCheck(trigger: string = 'manual'): Promise<WinnerPaymentCheckResult> {
  if (activeRun) {
    console.log(`[CRON] Winner payment check already running, joining existing run (${trigger})`)
    return activeRun
  }

  activeRun = checkWinnerPayments(trigger).finally(() => {
    activeRun = null
  })

  return activeRun
}

async function checkWinnerPayments(trigger: string): Promise<WinnerPaymentCheckResult> {
  console.log(`[CRON] Running winner payment check (${trigger})...`)
  await runAuctionFinalization(`winner-payment-check:${trigger}`)
  const now = new Date().toISOString()
  let notified = 0

  const { data: toNotify } = await supabaseAdmin
    .from('winners')
    .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
    .eq('payment_status', 'pending')
    .not('claim_token', 'is', null)
    .is('winner_email_sent_at', null)

  if (toNotify && toNotify.length > 0) {
    console.log(`[CRON] Found ${toNotify.length} winner(s) to notify`)
    for (const w of toNotify) {
      const claim = await claimWinnerNotificationSlot(w.id)
      if (!claim.claimed || !claim.claimedAt) {
        continue
      }

      const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
      const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single()

      if ((bidder as any)?.email && w.claim_token) {
        const sent = await sendWinnerEmail({
          to: (bidder as any).email,
          winnerName: (bidder as any)?.name || 'Winner',
          auctionTitle: (auction as any)?.title || 'Auction',
          winningAmount: Number(w.winning_amount),
          claimToken: w.claim_token,
          size: w.size,
          isEscalation: false
        })

        if (sent) {
          const sentAt = new Date().toISOString()
          const { error: markErr } = await supabaseAdmin
            .from('winners')
            .update(buildWinnerNotificationUpdate(sentAt))
            .eq('id', w.id)
            .eq('winner_email_sent_at', claim.claimedAt)

          if (markErr) {
            console.error(`[CRON] Email sent but failed to mark notification state for ${w.id}:`, markErr.message)
          } else {
            notified++
            console.log(`[CRON] Sent winner email for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`)
          }
        } else {
          await releaseWinnerNotificationClaim(w.id, claim.claimedAt)
        }
      } else {
        await releaseWinnerNotificationClaim(w.id, claim.claimedAt)
      }
    }
  }

  const { data: overdue } = await supabaseAdmin
    .from('winners')
    .select('id, auction_id, bidder_id, size, winning_amount, forfeited_bidder_ids')
    .eq('payment_status', 'pending')
    .not('payment_due_at', 'is', null)
    .lt('payment_due_at', now)

  if (!overdue || overdue.length === 0) {
    console.log(`[CRON] Winner payment check completed (${trigger})`)
    return { notified, marked_forfeited: 0, escalated: 0 }
  }

  console.log(`[CRON] Found ${overdue.length} overdue payment(s)`)
  let marked = 0
  let escalated = 0

  for (const w of overdue) {
    const alreadyForfeited: string[] = (w as any).forfeited_bidder_ids ?? []
    const nowForfeited = [...alreadyForfeited, w.bidder_id]

    const { data: forfeitedRow, error: upErr } = await supabaseAdmin
      .from('winners')
      .update({ payment_status: 'forfeited', forfeited_bidder_ids: nowForfeited })
      .eq('id', w.id)
      .eq('payment_status', 'pending')
      .eq('bidder_id', w.bidder_id)
      .select('id')
      .maybeSingle()

    if (upErr || !forfeitedRow) continue
    marked++

    let nextBidQuery = supabaseAdmin
      .from('bids')
      .select('bidder_id, amount')
      .eq('auction_id', w.auction_id)
      .order('amount', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    const excludedBidders = buildPostgrestInList(nowForfeited)
    if (excludedBidders !== '()') {
      nextBidQuery = nextBidQuery.not('bidder_id', 'in', excludedBidders)
    }

    if (w.size != null && w.size !== '') {
      nextBidQuery = nextBidQuery.eq('size', w.size)
    } else {
      nextBidQuery = nextBidQuery.is('size', null)
    }

    const { data: nextBid, error: nextBidError } = await nextBidQuery.maybeSingle()
    if (nextBidError) {
      console.error(`[CRON] Failed to load next bidder for winner ${w.id}:`, nextBidError.message)
      await supabaseAdmin
        .from('winners')
        .update({ payment_status: 'pending', forfeited_bidder_ids: alreadyForfeited })
        .eq('id', w.id)
        .eq('payment_status', 'forfeited')
      continue
    }

    if (!nextBid?.bidder_id) {
      console.error(
        `[CRON] Escalation exhausted - no remaining bidders for winner ${w.id}` +
        `${w.size ? ` (Size: ${w.size})` : ''}, auction ${w.auction_id}. Manual admin action required.`
      )
      continue
    }

    const newClaimToken = crypto.randomUUID()
    const { data: escalatedRow, error: escErr } = await supabaseAdmin
      .from('winners')
      .update(
        buildPendingWinnerOffer({
          bidderId: nextBid.bidder_id,
          winningAmount: Number(nextBid.amount),
          declaredAt: now,
          size: w.size,
          claimToken: newClaimToken,
          escalationDone: true
        })
      )
      .eq('id', w.id)
      .eq('payment_status', 'forfeited')
      .eq('bidder_id', w.bidder_id)
      .select('id')
      .maybeSingle()

    if (escErr || !escalatedRow) {
      console.error(
        `[CRON] Failed to escalate winner ${w.id}, rolling back to pending:`,
        escErr?.message || 'row changed during escalation'
      )
      await supabaseAdmin
        .from('winners')
        .update({ payment_status: 'pending', forfeited_bidder_ids: alreadyForfeited })
        .eq('id', w.id)
      continue
    }

    escalated++

    const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
    const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', nextBid.bidder_id).single()

    if ((bidder as any)?.email) {
      const sent = await sendWinnerEmail({
        to: (bidder as any).email,
        winnerName: (bidder as any)?.name || 'Winner',
        auctionTitle: (auction as any)?.title || 'Auction',
        winningAmount: Number(nextBid.amount),
        claimToken: newClaimToken,
        size: w.size,
        isEscalation: true
      })

      if (sent) {
        const sentAt = new Date().toISOString()
        const { error: markErr } = await supabaseAdmin
          .from('winners')
          .update(buildWinnerNotificationUpdate(sentAt))
          .eq('id', w.id)

        if (markErr) {
          console.error(`[CRON] Escalation email sent but failed to mark notification state for ${w.id}:`, markErr.message)
        } else {
          notified++
          console.log(`[CRON] Escalated to next bidder for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`)
        }
      }
    }
  }

  console.log(`[CRON] Marked ${marked} forfeited, escalated ${escalated}`)
  console.log(`[CRON] Winner payment check completed (${trigger})`)
  return { notified, marked_forfeited: marked, escalated }
}

async function claimWinnerNotificationSlot(winnerId: string): Promise<{ claimed: boolean; claimedAt?: string }> {
  const claimedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('winners')
    .update({ winner_email_sent_at: claimedAt })
    .eq('id', winnerId)
    .eq('payment_status', 'pending')
    .is('winner_email_sent_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`[CRON] Failed to claim winner notification slot for ${winnerId}:`, error.message)
    return { claimed: false }
  }

  return data ? { claimed: true, claimedAt } : { claimed: false }
}

async function releaseWinnerNotificationClaim(winnerId: string, claimedAt: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('winners')
    .update({ winner_email_sent_at: null })
    .eq('id', winnerId)
    .eq('payment_status', 'pending')
    .eq('winner_email_sent_at', claimedAt)

  if (error) {
    console.error(`[CRON] Failed to release winner notification slot for ${winnerId}:`, error.message)
  }
}

export function buildPostgrestInList(values: string[]): string {
  const cleaned = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  if (cleaned.length === 0) return '()'

  const escaped = cleaned.map((value) => `"${value.replace(/"/g, '\\"')}"`)
  return `(${escaped.join(',')})`
}
