"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCronJobs = initializeCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const email_service_1 = require("./email.service");
// Fix #1: prevent overlapping cron runs if processing takes longer than 5 minutes
let isRunning = false;
function initializeCronJobs() {
    // Run every 5 minutes: check for winners needing emails and payment deadline enforcement
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        if (isRunning) {
            console.log('[CRON] Previous run still in progress, skipping');
            return;
        }
        isRunning = true;
        console.log('[CRON] Running winner payment check...');
        try {
            await checkWinnerPayments();
            console.log('[CRON] Winner payment check completed');
        }
        catch (error) {
            console.error('[CRON] Winner payment check failed:', error);
        }
        finally {
            isRunning = false;
        }
    });
    console.log('[CRON] Jobs initialized - running every 5 minutes');
}
async function checkWinnerPayments() {
    const now = new Date().toISOString();
    // 1. Send winner email for any pending winner that was never notified (e.g. lazy-finalized)
    const { data: toNotify } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
        .eq('payment_status', 'pending')
        .not('claim_token', 'is', null)
        .is('winner_email_sent_at', null);
    if (toNotify && toNotify.length > 0) {
        console.log(`[CRON] Found ${toNotify.length} winner(s) to notify`);
        for (const w of toNotify) {
            const { data: auction } = await supabase_1.supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single();
            const { data: bidder } = await supabase_1.supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single();
            if (bidder?.email && w.claim_token) {
                const sent = await (0, email_service_1.sendWinnerEmail)({
                    to: bidder.email,
                    winnerName: bidder?.name || 'Winner',
                    auctionTitle: auction?.title || 'Auction',
                    winningAmount: Number(w.winning_amount),
                    claimToken: w.claim_token,
                    size: w.size,
                    isEscalation: false
                });
                if (sent) {
                    // Fix #6: log if DB mark fails — email was sent, duplicate may arrive next run
                    const { error: markErr } = await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id);
                    if (markErr) {
                        console.error(`[CRON] Email sent but failed to mark winner_email_sent_at for ${w.id} — may resend next run:`, markErr.message);
                    }
                    else {
                        console.log(`[CRON] Sent winner email for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`);
                    }
                }
            }
        }
    }
    // 2. Check for overdue payments and escalate
    // Fix #4: include forfeited_bidder_ids in initial select — no extra round-trip per row
    const { data: overdue } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, size, winning_amount, forfeited_bidder_ids')
        .eq('payment_status', 'pending')
        .lt('payment_due_at', now);
    if (!overdue || overdue.length === 0) {
        return;
    }
    console.log(`[CRON] Found ${overdue.length} overdue payment(s)`);
    let marked = 0;
    let escalated = 0;
    for (const w of overdue) {
        // Fix #4: forfeited_bidder_ids already in the row — no second DB query needed
        const alreadyForfeited = w.forfeited_bidder_ids ?? [];
        const nowForfeited = [...alreadyForfeited, w.bidder_id];
        // Mark as forfeited and persist the updated exclusion list
        const { error: upErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .update({ payment_status: 'forfeited', forfeited_bidder_ids: nowForfeited })
            .eq('id', w.id);
        if (upErr)
            continue;
        marked++;
        // Find next highest bidder, excluding ALL who have already forfeited
        // Fix #5: add created_at ASC tiebreaker — earlier bid wins on equal amounts
        let nextBidQuery = supabase_1.supabaseAdmin
            .from('bids')
            .select('bidder_id, amount')
            .eq('auction_id', w.auction_id)
            .not('bidder_id', 'in', `(${nowForfeited.join(',')})`)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1);
        if (w.size != null && w.size !== '') {
            nextBidQuery = nextBidQuery.eq('size', w.size);
        }
        else {
            nextBidQuery = nextBidQuery.is('size', null);
        }
        const { data: nextBid } = await nextBidQuery.maybeSingle();
        // Fix #7: log when escalation chain is exhausted — admin must handle manually
        if (!nextBid?.bidder_id) {
            console.error(`[CRON] ESCALATION EXHAUSTED — no remaining bidders for winner ${w.id}` +
                `${w.size ? ` (Size: ${w.size})` : ''}, auction ${w.auction_id}. Manual admin action required.`);
            continue;
        }
        // Fix #3: generate token here and reuse directly — no second DB fetch needed
        const newClaimToken = crypto_1.default.randomUUID();
        const newDue = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        const { error: escErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .update({
            bidder_id: nextBid.bidder_id,
            winning_amount: nextBid.amount,
            declared_at: now,
            payment_due_at: newDue,
            payment_status: 'pending',
            escalation_done: true,
            claim_token: newClaimToken,
            winner_email_sent_at: null
        })
            .eq('id', w.id);
        // Fix #2: if escalation write fails, roll back the forfeit so next cron run retries cleanly
        if (escErr) {
            console.error(`[CRON] Failed to escalate winner ${w.id}, rolling back to pending:`, escErr.message);
            await supabase_1.supabaseAdmin
                .from('winners')
                .update({ payment_status: 'pending', forfeited_bidder_ids: alreadyForfeited })
                .eq('id', w.id);
            continue;
        }
        escalated++;
        // Send escalation email using the token already in memory
        const { data: auction } = await supabase_1.supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single();
        const { data: bidder } = await supabase_1.supabaseAdmin.from('bidders').select('name, email').eq('id', nextBid.bidder_id).single();
        if (bidder?.email) {
            const sent = await (0, email_service_1.sendWinnerEmail)({
                to: bidder.email,
                winnerName: bidder?.name || 'Winner',
                auctionTitle: auction?.title || 'Auction',
                winningAmount: Number(nextBid.amount),
                claimToken: newClaimToken,
                size: w.size,
                isEscalation: true
            });
            if (sent) {
                // Fix #6: log if DB mark fails — email was sent, duplicate may arrive next run
                const { error: markErr } = await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id);
                if (markErr) {
                    console.error(`[CRON] Escalation email sent but failed to mark winner_email_sent_at for ${w.id} — may resend next run:`, markErr.message);
                }
                else {
                    console.log(`[CRON] Escalated to next bidder for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`);
                }
            }
        }
    }
    console.log(`[CRON] Marked ${marked} forfeited, escalated ${escalated}`);
}
