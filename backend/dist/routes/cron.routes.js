"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const email_service_1 = require("../services/email.service");
const router = express_1.default.Router();
// Cron: send missed winner emails, then check payment deadline and escalate
router.post('/cron/check-winner-payments', async (req, res) => {
    const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
    const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (secret && provided !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date().toISOString();
    try {
        // Send winner email for any pending winner that was never notified (e.g. lazy-finalized)
        const { data: toNotify } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
            .eq('payment_status', 'pending')
            .not('claim_token', 'is', null)
            .is('winner_email_sent_at', null);
        if (toNotify && toNotify.length > 0) {
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
                        isEscalation: false
                    });
                    if (sent)
                        await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id);
                }
            }
        }
        const { data: overdue } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, size, winning_amount')
            .eq('payment_status', 'pending')
            .lt('payment_due_at', now);
        if (!overdue || overdue.length === 0) {
            return res.json({ ok: true, marked_forfeited: 0, escalated: 0 });
        }
        let marked = 0;
        let escalated = 0;
        for (const w of overdue) {
            const { error: upErr } = await supabase_1.supabaseAdmin
                .from('winners')
                .update({ payment_status: 'forfeited' })
                .eq('id', w.id);
            if (upErr)
                continue;
            marked++;
            let secondBidQuery = supabase_1.supabaseAdmin
                .from('bids')
                .select('bidder_id, amount')
                .eq('auction_id', w.auction_id)
                .neq('bidder_id', w.bidder_id)
                .order('amount', { ascending: false })
                .limit(1);
            if (w.size != null && w.size !== '') {
                secondBidQuery = secondBidQuery.eq('size', w.size);
            }
            else {
                secondBidQuery = secondBidQuery.is('size', null);
            }
            const { data: secondBid } = await secondBidQuery.maybeSingle();
            if (!secondBid?.bidder_id)
                continue;
            const newDue = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
            const { error: escErr } = await supabase_1.supabaseAdmin
                .from('winners')
                .update({
                bidder_id: secondBid.bidder_id,
                winning_amount: secondBid.amount,
                declared_at: now,
                payment_due_at: newDue,
                payment_status: 'pending',
                escalation_done: true,
                claim_token: crypto_1.default.randomUUID(),
                winner_email_sent_at: null
            })
                .eq('id', w.id);
            if (escErr)
                continue;
            escalated++;
            const { data: auction } = await supabase_1.supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single();
            const { data: bidder } = await supabase_1.supabaseAdmin.from('bidders').select('name, email').eq('id', secondBid.bidder_id).single();
            const winnerRow = await supabase_1.supabaseAdmin.from('winners').select('claim_token').eq('id', w.id).single();
            const claimToken = winnerRow.data?.claim_token;
            if (bidder?.email && claimToken) {
                await (0, email_service_1.sendWinnerEmail)({
                    to: bidder.email,
                    winnerName: bidder?.name || 'Winner',
                    auctionTitle: auction?.title || 'Auction',
                    winningAmount: Number(secondBid.amount),
                    claimToken,
                    isEscalation: true
                });
                await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id);
            }
        }
        return res.json({ ok: true, marked_forfeited: marked, escalated });
    }
    catch (e) {
        console.error('Cron check-winner-payments error:', e);
        return res.status(500).json({ error: 'Cron failed' });
    }
});
exports.default = router;
