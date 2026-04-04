"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const services_1 = require("../config/services");
const env_1 = require("../config/env");
const payment_service_1 = require("../services/payment.service");
const winner_offer_service_1 = require("../services/winner-offer.service");
const router = express_1.default.Router();
function cleanText(value) {
    return String(value ?? '').trim();
}
function normalizeShippingAddress(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'Shipping address is required.' };
    }
    const raw = input;
    const address = {
        full_name: cleanText(raw.full_name),
        phone: cleanText(raw.phone),
        line1: cleanText(raw.line1),
        line2: cleanText(raw.line2),
        city: cleanText(raw.city),
        state: cleanText(raw.state),
        postal_code: cleanText(raw.postal_code),
        country: cleanText(raw.country) || 'India'
    };
    const requiredFields = ['full_name', 'phone', 'line1', 'city', 'state', 'postal_code'];
    for (const field of requiredFields) {
        if (!address[field]) {
            return { error: `Shipping ${field.replace('_', ' ')} is required.` };
        }
    }
    if (address.postal_code.length < 4 || address.postal_code.length > 12) {
        return { error: 'Please enter a valid postal code.' };
    }
    if (address.phone.length < 8 || address.phone.length > 20) {
        return { error: 'Please enter a valid phone number.' };
    }
    return { address };
}
// Public: get winner claim by token (for payment form)
router.get('/winner/claim', async (req, res) => {
    try {
        const token = req.query.token?.trim();
        if (!token) {
            return res.status(400).json({ error: 'Token required' });
        }
        const { data: winner, error } = await supabase_1.supabaseAdmin
            .from('winners')
            .select(`
        id, auction_id, winning_amount, payment_due_at, payment_status, size,
        payment_completed_at, payment_proof_note, razorpay_order_id, razorpay_payment_id,
        shipping_address, shipping_address_submitted_at,
        auction:auctions(title),
        bidder:bidders(name)
      `)
            .eq('claim_token', token)
            .single();
        if (error || !winner) {
            return res.status(404).json({ error: 'Invalid or expired claim link' });
        }
        const w = winner;
        const expired = (0, winner_offer_service_1.isWinnerPaymentExpired)(w);
        if (w.payment_status !== 'pending' && w.payment_status !== 'overdue') {
            return res.json({
                claim: true,
                status: w.payment_status,
                message: w.payment_status === 'completed' ? 'Payment already completed.' : 'This offer is no longer active.',
                auction_title: w.auction?.title,
                winning_amount: w.winning_amount,
                payment_due_at: w.payment_due_at,
                size: w.size,
                payment_completed_at: w.payment_completed_at,
                payment_proof_note: w.payment_proof_note,
                razorpay_order_id: w.razorpay_order_id,
                razorpay_payment_id: w.razorpay_payment_id,
                shipping_address: w.shipping_address,
                shipping_address_submitted_at: w.shipping_address_submitted_at
            });
        }
        if (expired) {
            return res.json({
                claim: true,
                status: 'expired',
                message: 'This payment window has expired. If you attempted payment, please contact support.',
                auction_title: w.auction?.title,
                winning_amount: w.winning_amount,
                payment_due_at: w.payment_due_at,
                size: w.size,
                shipping_address: w.shipping_address,
                shipping_address_submitted_at: w.shipping_address_submitted_at
            });
        }
        return res.json({
            claim: true,
            status: w.payment_status,
            auction_title: w.auction?.title,
            winning_amount: w.winning_amount,
            payment_due_at: w.payment_due_at,
            size: w.size,
            bidder_name: w.bidder?.name,
            shipping_address: w.shipping_address,
            shipping_address_submitted_at: w.shipping_address_submitted_at,
            razorpay_key_id: services_1.razorpay ? env_1.env.razorpayKeyId : undefined
        });
    }
    catch (e) {
        console.error('Winner claim get error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Public: create Razorpay order for winner (by claim token)
router.post('/winner/create-order', async (req, res) => {
    try {
        if (!services_1.razorpay) {
            return res.status(503).json({ error: 'Razorpay is not configured' });
        }
        const { token, shipping_address } = req.body || {};
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Token required' });
        }
        const normalizedShipping = normalizeShippingAddress(shipping_address);
        if (!normalizedShipping.address) {
            return res.status(400).json({ error: normalizedShipping.error || 'Invalid shipping address.' });
        }
        const { data: winner, error } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, winning_amount, payment_due_at, payment_status, razorpay_order_id')
            .eq('claim_token', token.trim())
            .single();
        if (error || !winner) {
            return res.status(404).json({ error: 'Invalid or expired claim link' });
        }
        const w = winner;
        if ((0, winner_offer_service_1.isWinnerPaymentExpired)(w)) {
            return res.status(400).json({ error: 'This payment window has expired.' });
        }
        if (w.payment_status !== 'pending' && w.payment_status !== 'overdue') {
            return res.status(400).json({ error: 'Payment already processed for this offer.' });
        }
        const shippingSubmittedAt = new Date().toISOString();
        const { error: shippingUpdateError } = await supabase_1.supabaseAdmin
            .from('winners')
            .update({
            shipping_address: normalizedShipping.address,
            shipping_address_submitted_at: shippingSubmittedAt
        })
            .eq('id', w.id);
        if (shippingUpdateError) {
            console.error('Failed to save shipping address:', shippingUpdateError);
            return res.status(500).json({ error: 'Failed to save shipping address' });
        }
        const amountRupees = Number(w.winning_amount);
        if (!Number.isFinite(amountRupees) || amountRupees < 1) {
            return res.status(400).json({ error: 'Invalid winning amount' });
        }
        const amountPaise = Math.round(amountRupees * 100);
        let orderId = w.razorpay_order_id;
        if (!orderId) {
            const receipt = `winner_${w.id.replace(/-/g, '_').slice(0, 24)}`;
            const order = await services_1.razorpay.orders.create({ amount: amountPaise, currency: 'INR', receipt });
            orderId = order.id;
            await supabase_1.supabaseAdmin.from('winners').update({ razorpay_order_id: orderId }).eq('id', w.id);
        }
        return res.json({
            key_id: env_1.env.razorpayKeyId,
            order_id: orderId,
            amount: amountPaise,
            currency: 'INR'
        });
    }
    catch (e) {
        console.error('Winner create-order error:', e);
        return res.status(500).json({ error: e?.message || 'Internal server error' });
    }
});
// Public: verify Razorpay payment and mark winner paid (after frontend checkout success)
router.post('/winner/verify-payment', async (req, res) => {
    try {
        const { token, razorpay_payment_id, razorpay_order_id, instagram_handle } = req.body || {};
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Token required' });
        }
        if (!razorpay_payment_id || !razorpay_order_id) {
            return res.status(400).json({ error: 'razorpay_payment_id and razorpay_order_id required' });
        }
        // Fail closed: never mark winners paid unless server-side Razorpay verification is available.
        if (!services_1.razorpay) {
            return res.status(503).json({ error: 'Payment verification service is unavailable. Please contact support.' });
        }
        const { data: winner, error } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, payment_due_at, payment_status, razorpay_order_id, winning_amount, shipping_address')
            .eq('claim_token', token.trim())
            .single();
        if (error || !winner) {
            return res.status(404).json({ error: 'Invalid or expired claim link' });
        }
        const w = winner;
        if ((0, winner_offer_service_1.isWinnerPaymentExpired)(w)) {
            return res.status(400).json({ error: 'This payment window has expired.' });
        }
        if (w.razorpay_order_id !== razorpay_order_id) {
            return res.status(400).json({ error: 'Order does not match this claim' });
        }
        if (w.payment_status === 'completed') {
            return res.json({ success: true, message: 'Payment already confirmed.' });
        }
        const normalizedShipping = normalizeShippingAddress(w.shipping_address);
        if (!normalizedShipping.address) {
            return res.status(400).json({ error: 'Please add delivery address before confirming payment.' });
        }
        {
            let payment = await services_1.razorpay.payments.fetch(razorpay_payment_id);
            // Many accounts return "authorized" first. Capture it here so proof is persisted immediately.
            if (payment?.status === 'authorized') {
                const amountPaise = Number(payment.amount);
                if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
                    return res.status(400).json({ error: 'Invalid winner amount for payment capture.' });
                }
                try {
                    payment = await services_1.razorpay.payments.capture(razorpay_payment_id, amountPaise, payment.currency || 'INR');
                }
                catch (captureError) {
                    console.warn('[winner.verify-payment] capture attempt failed, re-fetching payment status', captureError);
                    payment = await services_1.razorpay.payments.fetch(razorpay_payment_id);
                }
            }
            if (!payment || payment.status !== 'captured') {
                // Fallback: sometimes capture settles with delay; verify from order payment list.
                try {
                    const orderPayments = await services_1.razorpay.orders.fetchPayments(razorpay_order_id);
                    const items = Array.isArray(orderPayments?.items) ? orderPayments.items : [];
                    const capturedById = items.find((p) => String(p?.id) === String(razorpay_payment_id) && p?.status === 'captured');
                    const anyCaptured = items.find((p) => p?.status === 'captured');
                    payment = capturedById || anyCaptured || payment;
                }
                catch (orderFetchError) {
                    console.warn('[winner.verify-payment] order payment lookup failed', orderFetchError);
                }
            }
            if (!payment || payment.status !== 'captured') {
                return res.status(400).json({
                    error: `Payment is ${payment?.status || 'unknown'}. Please wait a minute and retry verification.`
                });
            }
            if (String(payment.order_id) !== String(razorpay_order_id)) {
                return res.status(400).json({ error: 'Payment order mismatch' });
            }
        }
        if (instagram_handle != null && String(instagram_handle).trim()) {
            await supabase_1.supabaseAdmin
                .from('winners')
                .update({ instagram_handle: String(instagram_handle).trim() })
                .eq('id', w.id);
        }
        const result = await (0, payment_service_1.markWinnerPaidRazorpay)(w.id, razorpay_payment_id, razorpay_order_id);
        if (!result.ok) {
            return res.status(500).json({ error: result.error || 'Failed to update' });
        }
        return res.json({
            success: true,
            message: 'Payment confirmed. You will receive a confirmation email shortly.',
            payment_status: 'completed',
            razorpay_payment_id,
            razorpay_order_id
        });
    }
    catch (e) {
        console.error('Winner verify-payment error:', e);
        return res.status(500).json({ error: e?.message || 'Internal server error' });
    }
});
// Razorpay webhook: payment.captured → mark winner paid (source of truth; idempotent)
router.post('/winner/webhook', async (req, res) => {
    try {
        const rawBody = req.rawBody;
        if (!rawBody || !rawBody.length) {
            return res.status(400).send('Missing body');
        }
        const signature = req.headers['x-razorpay-signature'];
        if (!env_1.env.razorpayWebhookSecret || !signature) {
            return res.status(400).send('Missing signature or webhook secret');
        }
        const expectedSig = crypto_1.default.createHmac('sha256', env_1.env.razorpayWebhookSecret).update(rawBody).digest('hex');
        if (expectedSig !== signature) {
            return res.status(400).send('Invalid signature');
        }
        const payload = JSON.parse(rawBody.toString('utf8'));
        if (payload.event !== 'payment.captured') {
            return res.status(200).send('OK');
        }
        const payment = payload.payload?.payment?.entity;
        if (!payment?.id || !payment?.order_id) {
            return res.status(200).send('OK');
        }
        const orderId = payment.order_id;
        const { data: winner } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id')
            .eq('razorpay_order_id', orderId)
            .maybeSingle();
        if (winner) {
            await (0, payment_service_1.markWinnerPaidRazorpay)(winner.id, payment.id, payment.order_id);
        }
        return res.status(200).send('OK');
    }
    catch (e) {
        console.error('Winner webhook error:', e);
        return res.status(500).send('Error');
    }
});
exports.default = router;
