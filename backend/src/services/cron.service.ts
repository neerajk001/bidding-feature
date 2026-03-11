import cron from 'node-cron'
import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { sendWinnerEmail } from './email.service'

export function initializeCronJobs() {
  // Run every 5 minutes: check for winners needing emails and payment deadline enforcement
  cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Running winner payment check...')
    try {
      await checkWinnerPayments()
      console.log('[CRON] Winner payment check completed')
    } catch (error) {
      console.error('[CRON] Winner payment check failed:', error)
    }
  })

  console.log('[CRON] Jobs initialized - running every 5 minutes')
}

async function checkWinnerPayments() {
  const now = new Date().toISOString()
  
  // 1. Send winner email for any pending winner that was never notified (e.g. lazy-finalized)
  const { data: toNotify } = await supabaseAdmin
    .from('winners')
    .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
    .eq('payment_status', 'pending')
    .not('claim_token', 'is', null)
    .is('winner_email_sent_at', null)

  if (toNotify && toNotify.length > 0) {
    console.log(`[CRON] Found ${toNotify.length} winner(s) to notify`)
    for (const w of toNotify) {
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
          await supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id)
          console.log(`[CRON] Sent winner email for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`)
        }
      }
    }
  }

  // 2. Check for overdue payments and escalate
  const { data: overdue } = await supabaseAdmin
    .from('winners')
    .select('id, auction_id, bidder_id, size, winning_amount')
    .eq('payment_status', 'pending')
    .lt('payment_due_at', now)

  if (!overdue || overdue.length === 0) {
    return
  }

  console.log(`[CRON] Found ${overdue.length} overdue payment(s)`)
  let marked = 0
  let escalated = 0

  for (const w of overdue) {
    // Mark as forfeited
    const { error: upErr } = await supabaseAdmin
      .from('winners')
      .update({ payment_status: 'forfeited' })
      .eq('id', w.id)
    
    if (upErr) continue
    marked++

    // Find second highest bidder
    let secondBidQuery = supabaseAdmin
      .from('bids')
      .select('bidder_id, amount')
      .eq('auction_id', w.auction_id)
      .neq('bidder_id', w.bidder_id)
      .order('amount', { ascending: false })
      .limit(1)

    if (w.size != null && w.size !== '') {
      secondBidQuery = secondBidQuery.eq('size', w.size)
    } else {
      secondBidQuery = secondBidQuery.is('size', null)
    }

    const { data: secondBid } = await secondBidQuery.maybeSingle()

    if (!secondBid?.bidder_id) continue

    // Escalate to second bidder
    const newDue = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    const { error: escErr } = await supabaseAdmin
      .from('winners')
      .update({
        bidder_id: secondBid.bidder_id,
        winning_amount: secondBid.amount,
        declared_at: now,
        payment_due_at: newDue,
        payment_status: 'pending',
        escalation_done: true,
        claim_token: crypto.randomUUID(),
        winner_email_sent_at: null
      })
      .eq('id', w.id)

    if (escErr) continue
    escalated++

    // Send escalation email
    const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
    const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', secondBid.bidder_id).single()
    const winnerRow = await supabaseAdmin.from('winners').select('claim_token').eq('id', w.id).single()
    const claimToken = (winnerRow.data as any)?.claim_token

    if (bidder?.email && claimToken) {
      const sent = await sendWinnerEmail({
        to: (bidder as any).email,
        winnerName: (bidder as any)?.name || 'Winner',
        auctionTitle: (auction as any)?.title || 'Auction',
        winningAmount: Number(secondBid.amount),
        claimToken,
        size: w.size,
        isEscalation: true
      })
      if (sent) {
        await supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id)
        console.log(`[CRON] Escalated to second bidder for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`)
      }
    }
  }

  console.log(`[CRON] Marked ${marked} forfeited, escalated ${escalated}`)
}
