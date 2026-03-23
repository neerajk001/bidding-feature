"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCronJobs = initializeCronJobs;
exports.runWinnerPaymentCheck = runWinnerPaymentCheck;
const node_cron_1 = __importDefault(require("node-cron"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const email_service_1 = require("./email.service");
const winner_offer_service_1 = require("./winner-offer.service");
let activeRun = null;
function initializeCronJobs() {
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        try {
            await runWinnerPaymentCheck('scheduler');
        }
        catch (error) {
            console.error('[CRON] Winner payment check failed:', error);
        }
    });
    console.log('[CRON] Jobs initialized - running every 5 minutes');
}
async function runWinnerPaymentCheck(trigger = 'manual') {
    if (activeRun) {
        console.log(`[CRON] Winner payment check already running, joining existing run (${trigger})`);
        return activeRun;
    }
    activeRun = checkWinnerPayments(trigger).finally(() => {
        activeRun = null;
    });
    return activeRun;
}
async function checkWinnerPayments(trigger) {
    console.log(`[CRON] Running winner payment check (${trigger})...`);
    const now = new Date().toISOString();
    let notified = 0;
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
                    const sentAt = new Date().toISOString();
                    const { error: markErr } = await supabase_1.supabaseAdmin
                        .from('winners')
                        .update((0, winner_offer_service_1.buildWinnerNotificationUpdate)(sentAt))
                        .eq('id', w.id);
                    if (markErr) {
                        console.error(`[CRON] Email sent but failed to mark notification state for ${w.id}:`, markErr.message);
                    }
                    else {
                        notified++;
                        console.log(`[CRON] Sent winner email for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`);
                    }
                }
            }
        }
    }
    const { data: overdue } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, size, winning_amount, forfeited_bidder_ids')
        .eq('payment_status', 'pending')
        .not('payment_due_at', 'is', null)
        .lt('payment_due_at', now);
    if (!overdue || overdue.length === 0) {
        console.log(`[CRON] Winner payment check completed (${trigger})`);
        return { notified, marked_forfeited: 0, escalated: 0 };
    }
    console.log(`[CRON] Found ${overdue.length} overdue payment(s)`);
    let marked = 0;
    let escalated = 0;
    for (const w of overdue) {
        const alreadyForfeited = w.forfeited_bidder_ids ?? [];
        const nowForfeited = [...alreadyForfeited, w.bidder_id];
        const { data: forfeitedRow, error: upErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .update({ payment_status: 'forfeited', forfeited_bidder_ids: nowForfeited })
            .eq('id', w.id)
            .eq('payment_status', 'pending')
            .eq('bidder_id', w.bidder_id)
            .select('id')
            .maybeSingle();
        if (upErr || !forfeitedRow)
            continue;
        marked++;
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
        if (!nextBid?.bidder_id) {
            console.error(`[CRON] Escalation exhausted - no remaining bidders for winner ${w.id}` +
                `${w.size ? ` (Size: ${w.size})` : ''}, auction ${w.auction_id}. Manual admin action required.`);
            continue;
        }
        const newClaimToken = crypto_1.default.randomUUID();
        const { data: escalatedRow, error: escErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .update((0, winner_offer_service_1.buildPendingWinnerOffer)({
            bidderId: nextBid.bidder_id,
            winningAmount: Number(nextBid.amount),
            declaredAt: now,
            size: w.size,
            claimToken: newClaimToken,
            escalationDone: true
        }))
            .eq('id', w.id)
            .eq('payment_status', 'forfeited')
            .eq('bidder_id', w.bidder_id)
            .select('id')
            .maybeSingle();
        if (escErr || !escalatedRow) {
            console.error(`[CRON] Failed to escalate winner ${w.id}, rolling back to pending:`, escErr?.message || 'row changed during escalation');
            await supabase_1.supabaseAdmin
                .from('winners')
                .update({ payment_status: 'pending', forfeited_bidder_ids: alreadyForfeited })
                .eq('id', w.id);
            continue;
        }
        escalated++;
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
                const sentAt = new Date().toISOString();
                const { error: markErr } = await supabase_1.supabaseAdmin
                    .from('winners')
                    .update((0, winner_offer_service_1.buildWinnerNotificationUpdate)(sentAt))
                    .eq('id', w.id);
                if (markErr) {
                    console.error(`[CRON] Escalation email sent but failed to mark notification state for ${w.id}:`, markErr.message);
                }
                else {
                    notified++;
                    console.log(`[CRON] Escalated to next bidder for winner ${w.id}${w.size ? ` (Size: ${w.size})` : ''}`);
                }
            }
        }
    }
    console.log(`[CRON] Marked ${marked} forfeited, escalated ${escalated}`);
    console.log(`[CRON] Winner payment check completed (${trigger})`);
    return { notified, marked_forfeited: marked, escalated };
}
