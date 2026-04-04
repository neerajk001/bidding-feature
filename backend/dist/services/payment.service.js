"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRazorpayPaymentCompletionUpdate = buildRazorpayPaymentCompletionUpdate;
exports.markWinnerPaidRazorpay = markWinnerPaidRazorpay;
const supabase_1 = require("../config/supabase");
const email_service_1 = require("./email.service");
function buildRazorpayPaymentCompletionUpdate(paymentId, orderId, nowIso = new Date().toISOString()) {
    const updates = {
        payment_status: 'completed',
        payment_completed_at: nowIso,
        payment_verified_by_admin: true,
        razorpay_payment_id: paymentId,
        payment_proof_note: 'Verified via Razorpay API'
    };
    if (orderId) {
        updates.razorpay_order_id = orderId;
    }
    return updates;
}
/** Mark winner as paid (Razorpay), send confirmation email. Idempotent if already completed. */
async function markWinnerPaidRazorpay(winnerId, paymentId, orderId) {
    const { data: winner, error: fetchErr } = await supabase_1.supabaseAdmin
        .from('winners')
        .select('id, payment_status, bidder_id, auction_id, razorpay_order_id')
        .eq('id', winnerId)
        .single();
    if (fetchErr || !winner)
        return { ok: false, error: 'Winner not found' };
    const w = winner;
    if (w.payment_status === 'completed')
        return { ok: true };
    if (orderId && w.razorpay_order_id && String(w.razorpay_order_id) !== String(orderId)) {
        return { ok: false, error: 'Winner payment order mismatch' };
    }
    const updates = buildRazorpayPaymentCompletionUpdate(paymentId, orderId);
    const { data: updatedWinner, error: upErr } = await supabase_1.supabaseAdmin
        .from('winners')
        .update(updates)
        .eq('id', winnerId)
        .eq('bidder_id', w.bidder_id)
        .in('payment_status', ['pending', 'overdue'])
        .select('id, bidder_id, auction_id')
        .maybeSingle();
    if (upErr)
        return { ok: false, error: upErr.message };
    if (!updatedWinner) {
        const { data: latestWinner } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('payment_status')
            .eq('id', winnerId)
            .maybeSingle();
        if (latestWinner?.payment_status === 'completed') {
            return { ok: true };
        }
        return { ok: false, error: 'Winner payment state changed. Please retry verification.' };
    }
    const freshWinner = updatedWinner;
    const { data: bidder } = await supabase_1.supabaseAdmin
        .from('bidders')
        .select('email, name')
        .eq('id', freshWinner.bidder_id)
        .single();
    const { data: auction } = await supabase_1.supabaseAdmin
        .from('auctions')
        .select('title')
        .eq('id', freshWinner.auction_id)
        .single();
    if (bidder?.email) {
        await (0, email_service_1.sendPaymentConfirmedEmail)(bidder.email, bidder?.name || 'Winner', auction?.title || 'Auction');
    }
    return { ok: true };
}
