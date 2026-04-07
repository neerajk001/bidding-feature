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

const CRON_BATCH_LIMIT = 20
const CRON_PAYLOAD_BUDGET_BYTES = 50 * 1024

function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8')
  } catch {
    return 0
  }
}

function consumePayloadBudget(remainingBytes: number, chunk: unknown, label: string): { ok: boolean; remaining: number } {
  const chunkBytes = estimatePayloadBytes(chunk)
  if (chunkBytes > remainingBytes) {
    console.warn(`[CRON] Payload budget exceeded at ${label}: chunk=${chunkBytes}B, remaining=${remainingBytes}B`)
    return { ok: false, remaining: remainingBytes }
  }
  return { ok: true, remaining: remainingBytes - chunkBytes }
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
  const now = new Date().toISOString()
  let notified = 0
  let remainingPayloadBudget = CRON_PAYLOAD_BUDGET_BYTES

  const { data: toNotify } = await supabaseAdmin
    .from('winners')
    .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
    .eq('payment_status', 'pending')
    .not('claim_token', 'is', null)
    .is('winner_email_sent_at', null)
    .order('id', { ascending: true })
    .limit(CRON_BATCH_LIMIT)

  {
    const budgetCheck = consumePayloadBudget(remainingPayloadBudget, toNotify || [], 'winners.toNotify')
    if (!budgetCheck.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: 0, escalated: 0 }
    }
    remainingPayloadBudget = budgetCheck.remaining
  }

  const notifyAuctionIds = Array.from(new Set((toNotify || []).map((w: any) => String(w.auction_id || '')).filter(Boolean)))
  const notifyBidderIds = Array.from(new Set((toNotify || []).map((w: any) => String(w.bidder_id || '')).filter(Boolean)))

  const [{ data: notifyAuctions }, { data: notifyBidders }] = await Promise.all([
    notifyAuctionIds.length > 0
      ? supabaseAdmin
          .from('auctions')
          .select('id, title')
          .in('id', notifyAuctionIds)
      : Promise.resolve({ data: [] as any[] }),
    notifyBidderIds.length > 0
      ? supabaseAdmin
          .from('bidders')
          .select('id, name, email')
          .in('id', notifyBidderIds)
      : Promise.resolve({ data: [] as any[] })
  ])

  {
    const auctionsBudget = consumePayloadBudget(remainingPayloadBudget, notifyAuctions || [], 'auctions.notifyAuctions')
    if (!auctionsBudget.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: 0, escalated: 0 }
    }
    remainingPayloadBudget = auctionsBudget.remaining

    const biddersBudget = consumePayloadBudget(remainingPayloadBudget, notifyBidders || [], 'bidders.notifyBidders')
    if (!biddersBudget.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: 0, escalated: 0 }
    }
    remainingPayloadBudget = biddersBudget.remaining
  }

  const notifyAuctionMap = new Map<string, any>((notifyAuctions || []).map((a: any) => [String(a.id), a]))
  const notifyBidderMap = new Map<string, any>((notifyBidders || []).map((b: any) => [String(b.id), b]))

  if (toNotify && toNotify.length > 0) {
    console.log(`[CRON] Found ${toNotify.length} winner(s) to notify`)
    for (const w of toNotify) {
      const claim = await claimWinnerNotificationSlot(w.id)
      if (!claim.claimed || !claim.claimedAt) {
        continue
      }

      const { data: currentWinner, error: currentWinnerError } = await supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
        .eq('id', w.id)
        .eq('payment_status', 'pending')
        .eq('winner_email_sent_at', claim.claimedAt)
        .maybeSingle()

      if (currentWinnerError) {
        console.error(`[CRON] Failed to load winner ${w.id} after claim:`, currentWinnerError.message)
        await releaseWinnerNotificationClaim(w.id, claim.claimedAt)
        continue
      }

      if (!currentWinner) {
        continue
      }

      const cw = currentWinner as any
      const auction = notifyAuctionMap.get(String(cw.auction_id)) || null
      const bidder = notifyBidderMap.get(String(cw.bidder_id)) || null

      if ((bidder as any)?.email && cw.claim_token) {
        const sent = await sendWinnerEmail({
          to: (bidder as any).email,
          winnerName: (bidder as any)?.name || 'Winner',
          auctionTitle: (auction as any)?.title || 'Auction',
          winningAmount: Number(cw.winning_amount),
          claimToken: cw.claim_token,
          size: cw.size,
          isEscalation: false
        })

        if (sent) {
          const sentAt = new Date().toISOString()
          const { data: markedRow, error: markErr } = await supabaseAdmin
            .from('winners')
            .update(buildWinnerNotificationUpdate(sentAt))
            .eq('id', w.id)
            .eq('bidder_id', cw.bidder_id)
            .eq('winner_email_sent_at', claim.claimedAt)
            .select('id')
            .maybeSingle()

          if (markErr) {
            console.error(`[CRON] Email sent but failed to mark notification state for ${w.id}:`, markErr.message)
          } else if (!markedRow) {
            await releaseWinnerNotificationClaim(w.id, claim.claimedAt)
          } else {
            notified++
            console.log(`[CRON] Sent winner email for winner ${w.id}${cw.size ? ` (Size: ${cw.size})` : ''}`)
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
    .order('payment_due_at', { ascending: true })
    .limit(CRON_BATCH_LIMIT)

  {
    const budgetCheck = consumePayloadBudget(remainingPayloadBudget, overdue || [], 'winners.overdue')
    if (!budgetCheck.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: 0, escalated: 0 }
    }
    remainingPayloadBudget = budgetCheck.remaining
  }

  if (!overdue || overdue.length === 0) {
    console.log(`[CRON] Winner payment check completed (${trigger})`)
    return { notified, marked_forfeited: 0, escalated: 0 }
  }

  console.log(`[CRON] Found ${overdue.length} overdue payment(s)`)
  let marked = 0
  let escalated = 0
  const pendingEscalationEmails: Array<{ winnerId: string; auctionId: string; bidderId: string; winningAmount: number; claimToken: string; size: string | null }> = []

  const overdueAuctionIds = Array.from(new Set((overdue || []).map((w: any) => String(w.auction_id || '')).filter(Boolean)))
  const { data: overdueAuctions } = overdueAuctionIds.length > 0
    ? await supabaseAdmin
        .from('auctions')
        .select('id, title')
        .in('id', overdueAuctionIds)
    : { data: [] as any[] }

  {
    const budgetCheck = consumePayloadBudget(remainingPayloadBudget, overdueAuctions || [], 'auctions.overdueAuctions')
    if (!budgetCheck.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: marked, escalated }
    }
    remainingPayloadBudget = budgetCheck.remaining
  }
  const overdueAuctionMap = new Map<string, any>((overdueAuctions || []).map((a: any) => [String(a.id), a]))

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
      .select('id, bidder_id, winning_amount, claim_token, size')
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
    const ew = escalatedRow as any
    pendingEscalationEmails.push({
      winnerId: String(w.id),
      auctionId: String(w.auction_id),
      bidderId: String(ew.bidder_id),
      winningAmount: Number(ew.winning_amount),
      claimToken: String(ew.claim_token),
      size: ew.size ?? null
    })
  }

  const escalationBidderIds = Array.from(new Set(pendingEscalationEmails.map((item) => item.bidderId).filter(Boolean)))
  const { data: escalationBidders } = escalationBidderIds.length > 0
    ? await supabaseAdmin
        .from('bidders')
        .select('id, name, email')
        .in('id', escalationBidderIds)
    : { data: [] as any[] }

  {
    const budgetCheck = consumePayloadBudget(remainingPayloadBudget, escalationBidders || [], 'bidders.escalationBidders')
    if (!budgetCheck.ok) {
      console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`)
      return { notified, marked_forfeited: marked, escalated }
    }
    remainingPayloadBudget = budgetCheck.remaining
  }
  const escalationBidderMap = new Map<string, any>((escalationBidders || []).map((b: any) => [String(b.id), b]))

  for (const escalation of pendingEscalationEmails) {
    const bidder = escalationBidderMap.get(escalation.bidderId)
    if (!(bidder as any)?.email) continue
    const auction = overdueAuctionMap.get(escalation.auctionId)

    const sent = await sendWinnerEmail({
      to: (bidder as any).email,
      winnerName: (bidder as any)?.name || 'Winner',
      auctionTitle: (auction as any)?.title || 'Auction',
      winningAmount: escalation.winningAmount,
      claimToken: escalation.claimToken,
      size: escalation.size,
      isEscalation: true
    })

    if (!sent) continue

    const sentAt = new Date().toISOString()
    const { error: markErr } = await supabaseAdmin
      .from('winners')
      .update(buildWinnerNotificationUpdate(sentAt))
      .eq('id', escalation.winnerId)
      .eq('bidder_id', escalation.bidderId)
      .eq('claim_token', escalation.claimToken)

    if (markErr) {
      console.error(`[CRON] Escalation email sent but failed to mark notification state for ${escalation.winnerId}:`, markErr.message)
    } else {
      notified++
      console.log(`[CRON] Escalated to next bidder for winner ${escalation.winnerId}${escalation.size ? ` (Size: ${escalation.size})` : ''}`)
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
