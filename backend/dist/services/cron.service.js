"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCronJobs = initializeCronJobs;
exports.runAuctionFinalization = runAuctionFinalization;
exports.runWinnerPaymentCheck = runWinnerPaymentCheck;
exports.buildPostgrestInList = buildPostgrestInList;
const node_cron_1 = __importDefault(require("node-cron"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const auction_service_1 = require("./auction.service");
const email_service_1 = require("./email.service");
const winner_offer_service_1 = require("./winner-offer.service");
const CRON_BATCH_LIMIT = 20;
const CRON_PAYLOAD_BUDGET_BYTES = 50 * 1024;
function estimatePayloadBytes(value) {
    try {
        return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
    }
    catch {
        return 0;
    }
}
function consumePayloadBudget(remainingBytes, chunk, label) {
    const chunkBytes = estimatePayloadBytes(chunk);
    if (chunkBytes > remainingBytes) {
        console.warn(`[CRON] Payload budget exceeded at ${label}: chunk=${chunkBytes}B, remaining=${remainingBytes}B`);
        return { ok: false, remaining: remainingBytes };
    }
    return { ok: true, remaining: remainingBytes - chunkBytes };
}
let activeRun = null;
let activeFinalizationRun = null;
function initializeCronJobs() {
    // Ensure auction end finalization is no longer dependent on public API traffic.
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            await runAuctionFinalization('scheduler');
        }
        catch (error) {
            console.error('[CRON] Auction finalization failed:', error);
        }
    });
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        try {
            await runWinnerPaymentCheck('scheduler');
        }
        catch (error) {
            console.error('[CRON] Winner payment check failed:', error);
        }
    });
    console.log('[CRON] Jobs initialized - auction finalization every 1 minute, winner checks every 5 minutes');
}
async function runAuctionFinalization(trigger = 'manual') {
    if (activeFinalizationRun) {
        console.log(`[CRON] Auction finalization already running, joining existing run (${trigger})`);
        return activeFinalizationRun;
    }
    activeFinalizationRun = (async () => {
        const result = await (0, auction_service_1.finalizeEndedAuctions)();
        const finalized = result.endedAuctionIds.length;
        if (finalized > 0 || result.errors.length > 0) {
            console.log(`[CRON] Auction finalization (${trigger}): finalized=${finalized}, errors=${result.errors.length}`);
        }
        if (result.errors.length > 0) {
            console.error('[CRON] Auction finalization errors:', result.errors);
        }
        return { finalized, errors: result.errors };
    })().finally(() => {
        activeFinalizationRun = null;
    });
    return activeFinalizationRun;
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
    let remainingPayloadBudget = CRON_PAYLOAD_BUDGET_BYTES;
    const { data: toNotify } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
        .eq('payment_status', 'pending')
        .not('claim_token', 'is', null)
        .is('winner_email_sent_at', null)
        .order('id', { ascending: true })
        .limit(CRON_BATCH_LIMIT);
    {
        const budgetCheck = consumePayloadBudget(remainingPayloadBudget, toNotify || [], 'winners.toNotify');
        if (!budgetCheck.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: 0, escalated: 0 };
        }
        remainingPayloadBudget = budgetCheck.remaining;
    }
    const notifyAuctionIds = Array.from(new Set((toNotify || []).map((w) => String(w.auction_id || '')).filter(Boolean)));
    const notifyBidderIds = Array.from(new Set((toNotify || []).map((w) => String(w.bidder_id || '')).filter(Boolean)));
    const [{ data: notifyAuctions }, { data: notifyBidders }] = await Promise.all([
        notifyAuctionIds.length > 0
            ? supabase_1.supabaseAdmin
                .from('auctions')
                .select('id, title')
                .in('id', notifyAuctionIds)
            : Promise.resolve({ data: [] }),
        notifyBidderIds.length > 0
            ? supabase_1.supabaseAdmin
                .from('bidders')
                .select('id, name, email')
                .in('id', notifyBidderIds)
            : Promise.resolve({ data: [] })
    ]);
    {
        const auctionsBudget = consumePayloadBudget(remainingPayloadBudget, notifyAuctions || [], 'auctions.notifyAuctions');
        if (!auctionsBudget.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: 0, escalated: 0 };
        }
        remainingPayloadBudget = auctionsBudget.remaining;
        const biddersBudget = consumePayloadBudget(remainingPayloadBudget, notifyBidders || [], 'bidders.notifyBidders');
        if (!biddersBudget.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: 0, escalated: 0 };
        }
        remainingPayloadBudget = biddersBudget.remaining;
    }
    const notifyAuctionMap = new Map((notifyAuctions || []).map((a) => [String(a.id), a]));
    const notifyBidderMap = new Map((notifyBidders || []).map((b) => [String(b.id), b]));
    if (toNotify && toNotify.length > 0) {
        console.log(`[CRON] Found ${toNotify.length} winner(s) to notify`);
        for (const w of toNotify) {
            const claim = await claimWinnerNotificationSlot(w.id);
            if (!claim.claimed || !claim.claimedAt) {
                continue;
            }
            const { data: currentWinner, error: currentWinnerError } = await supabase_1.supabaseAdmin
                .from('winners')
                .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
                .eq('id', w.id)
                .eq('payment_status', 'pending')
                .eq('winner_email_sent_at', claim.claimedAt)
                .maybeSingle();
            if (currentWinnerError) {
                console.error(`[CRON] Failed to load winner ${w.id} after claim:`, currentWinnerError.message);
                await releaseWinnerNotificationClaim(w.id, claim.claimedAt);
                continue;
            }
            if (!currentWinner) {
                continue;
            }
            const cw = currentWinner;
            const auction = notifyAuctionMap.get(String(cw.auction_id)) || null;
            const bidder = notifyBidderMap.get(String(cw.bidder_id)) || null;
            if (bidder?.email && cw.claim_token) {
                const sent = await (0, email_service_1.sendWinnerEmail)({
                    to: bidder.email,
                    winnerName: bidder?.name || 'Winner',
                    auctionTitle: auction?.title || 'Auction',
                    winningAmount: Number(cw.winning_amount),
                    claimToken: cw.claim_token,
                    size: cw.size,
                    isEscalation: false
                });
                if (sent) {
                    const sentAt = new Date().toISOString();
                    const { data: markedRow, error: markErr } = await supabase_1.supabaseAdmin
                        .from('winners')
                        .update((0, winner_offer_service_1.buildWinnerNotificationUpdate)(sentAt))
                        .eq('id', w.id)
                        .eq('bidder_id', cw.bidder_id)
                        .eq('winner_email_sent_at', claim.claimedAt)
                        .select('id')
                        .maybeSingle();
                    if (markErr) {
                        console.error(`[CRON] Email sent but failed to mark notification state for ${w.id}:`, markErr.message);
                    }
                    else if (!markedRow) {
                        await releaseWinnerNotificationClaim(w.id, claim.claimedAt);
                    }
                    else {
                        notified++;
                        console.log(`[CRON] Sent winner email for winner ${w.id}${cw.size ? ` (Size: ${cw.size})` : ''}`);
                    }
                }
                else {
                    await releaseWinnerNotificationClaim(w.id, claim.claimedAt);
                }
            }
            else {
                await releaseWinnerNotificationClaim(w.id, claim.claimedAt);
            }
        }
    }
    const { data: overdue } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, size, winning_amount, forfeited_bidder_ids')
        .eq('payment_status', 'pending')
        .not('payment_due_at', 'is', null)
        .lt('payment_due_at', now)
        .order('payment_due_at', { ascending: true })
        .limit(CRON_BATCH_LIMIT);
    {
        const budgetCheck = consumePayloadBudget(remainingPayloadBudget, overdue || [], 'winners.overdue');
        if (!budgetCheck.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: 0, escalated: 0 };
        }
        remainingPayloadBudget = budgetCheck.remaining;
    }
    if (!overdue || overdue.length === 0) {
        console.log(`[CRON] Winner payment check completed (${trigger})`);
        return { notified, marked_forfeited: 0, escalated: 0 };
    }
    console.log(`[CRON] Found ${overdue.length} overdue payment(s)`);
    let marked = 0;
    let escalated = 0;
    const pendingEscalationEmails = [];
    const overdueAuctionIds = Array.from(new Set((overdue || []).map((w) => String(w.auction_id || '')).filter(Boolean)));
    const { data: overdueAuctions } = overdueAuctionIds.length > 0
        ? await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title')
            .in('id', overdueAuctionIds)
        : { data: [] };
    {
        const budgetCheck = consumePayloadBudget(remainingPayloadBudget, overdueAuctions || [], 'auctions.overdueAuctions');
        if (!budgetCheck.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: marked, escalated };
        }
        remainingPayloadBudget = budgetCheck.remaining;
    }
    const overdueAuctionMap = new Map((overdueAuctions || []).map((a) => [String(a.id), a]));
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
            .order('amount', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1);
        const excludedBidders = buildPostgrestInList(nowForfeited);
        if (excludedBidders !== '()') {
            nextBidQuery = nextBidQuery.not('bidder_id', 'in', excludedBidders);
        }
        if (w.size != null && w.size !== '') {
            nextBidQuery = nextBidQuery.eq('size', w.size);
        }
        else {
            nextBidQuery = nextBidQuery.is('size', null);
        }
        const { data: nextBid, error: nextBidError } = await nextBidQuery.maybeSingle();
        if (nextBidError) {
            console.error(`[CRON] Failed to load next bidder for winner ${w.id}:`, nextBidError.message);
            await supabase_1.supabaseAdmin
                .from('winners')
                .update({ payment_status: 'pending', forfeited_bidder_ids: alreadyForfeited })
                .eq('id', w.id)
                .eq('payment_status', 'forfeited');
            continue;
        }
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
            .select('id, bidder_id, winning_amount, claim_token, size')
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
        const ew = escalatedRow;
        pendingEscalationEmails.push({
            winnerId: String(w.id),
            auctionId: String(w.auction_id),
            bidderId: String(ew.bidder_id),
            winningAmount: Number(ew.winning_amount),
            claimToken: String(ew.claim_token),
            size: ew.size ?? null
        });
    }
    const escalationBidderIds = Array.from(new Set(pendingEscalationEmails.map((item) => item.bidderId).filter(Boolean)));
    const { data: escalationBidders } = escalationBidderIds.length > 0
        ? await supabase_1.supabaseAdmin
            .from('bidders')
            .select('id, name, email')
            .in('id', escalationBidderIds)
        : { data: [] };
    {
        const budgetCheck = consumePayloadBudget(remainingPayloadBudget, escalationBidders || [], 'bidders.escalationBidders');
        if (!budgetCheck.ok) {
            console.log(`[CRON] Winner payment check aborted (${trigger}) due to payload budget`);
            return { notified, marked_forfeited: marked, escalated };
        }
        remainingPayloadBudget = budgetCheck.remaining;
    }
    const escalationBidderMap = new Map((escalationBidders || []).map((b) => [String(b.id), b]));
    for (const escalation of pendingEscalationEmails) {
        const bidder = escalationBidderMap.get(escalation.bidderId);
        if (!bidder?.email)
            continue;
        const auction = overdueAuctionMap.get(escalation.auctionId);
        const sent = await (0, email_service_1.sendWinnerEmail)({
            to: bidder.email,
            winnerName: bidder?.name || 'Winner',
            auctionTitle: auction?.title || 'Auction',
            winningAmount: escalation.winningAmount,
            claimToken: escalation.claimToken,
            size: escalation.size,
            isEscalation: true
        });
        if (!sent)
            continue;
        const sentAt = new Date().toISOString();
        const { error: markErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .update((0, winner_offer_service_1.buildWinnerNotificationUpdate)(sentAt))
            .eq('id', escalation.winnerId)
            .eq('bidder_id', escalation.bidderId)
            .eq('claim_token', escalation.claimToken);
        if (markErr) {
            console.error(`[CRON] Escalation email sent but failed to mark notification state for ${escalation.winnerId}:`, markErr.message);
        }
        else {
            notified++;
            console.log(`[CRON] Escalated to next bidder for winner ${escalation.winnerId}${escalation.size ? ` (Size: ${escalation.size})` : ''}`);
        }
    }
    console.log(`[CRON] Marked ${marked} forfeited, escalated ${escalated}`);
    console.log(`[CRON] Winner payment check completed (${trigger})`);
    return { notified, marked_forfeited: marked, escalated };
}
async function claimWinnerNotificationSlot(winnerId) {
    const claimedAt = new Date().toISOString();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('winners')
        .update({ winner_email_sent_at: claimedAt })
        .eq('id', winnerId)
        .eq('payment_status', 'pending')
        .is('winner_email_sent_at', null)
        .select('id')
        .maybeSingle();
    if (error) {
        console.error(`[CRON] Failed to claim winner notification slot for ${winnerId}:`, error.message);
        return { claimed: false };
    }
    return data ? { claimed: true, claimedAt } : { claimed: false };
}
async function releaseWinnerNotificationClaim(winnerId, claimedAt) {
    const { error } = await supabase_1.supabaseAdmin
        .from('winners')
        .update({ winner_email_sent_at: null })
        .eq('id', winnerId)
        .eq('payment_status', 'pending')
        .eq('winner_email_sent_at', claimedAt);
    if (error) {
        console.error(`[CRON] Failed to release winner notification slot for ${winnerId}:`, error.message);
    }
}
function buildPostgrestInList(values) {
    const cleaned = values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
    if (cleaned.length === 0)
        return '()';
    const escaped = cleaned.map((value) => `"${value.replace(/"/g, '\\"')}"`);
    return `(${escaped.join(',')})`;
}
