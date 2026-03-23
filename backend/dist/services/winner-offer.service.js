"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWinnerPaymentDueAt = getWinnerPaymentDueAt;
exports.buildPendingWinnerOffer = buildPendingWinnerOffer;
exports.buildWinnerNotificationUpdate = buildWinnerNotificationUpdate;
exports.isWinnerPaymentExpired = isWinnerPaymentExpired;
const crypto_1 = __importDefault(require("crypto"));
const PAYMENT_WINDOW_MS = 12 * 60 * 60 * 1000;
function getWinnerPaymentDueAt(baseIso = new Date().toISOString()) {
    const base = new Date(baseIso);
    return new Date(base.getTime() + PAYMENT_WINDOW_MS).toISOString();
}
function buildPendingWinnerOffer(input) {
    return {
        bidder_id: input.bidderId,
        winning_amount: input.winningAmount,
        declared_at: input.declaredAt || new Date().toISOString(),
        size: input.size ?? null,
        payment_due_at: getWinnerPaymentDueAt(),
        payment_status: 'pending',
        payment_completed_at: null,
        payment_proof_note: null,
        payment_proof_url: null,
        payment_verified_by_admin: false,
        instagram_handle: null,
        shipping_address: null,
        shipping_address_submitted_at: null,
        dispatched_at: null,
        escalation_done: Boolean(input.escalationDone),
        claim_token: input.claimToken || crypto_1.default.randomUUID(),
        winner_email_sent_at: null,
        razorpay_order_id: null,
        razorpay_payment_id: null
    };
}
function buildWinnerNotificationUpdate(sentAt = new Date().toISOString()) {
    return {
        winner_email_sent_at: sentAt,
        payment_due_at: getWinnerPaymentDueAt(sentAt)
    };
}
function isWinnerPaymentExpired(winner, nowTs = Date.now()) {
    if (winner.payment_status !== 'pending' && winner.payment_status !== 'overdue')
        return false;
    if (!winner.payment_due_at)
        return false;
    const dueTs = new Date(winner.payment_due_at).getTime();
    return Number.isFinite(dueTs) && dueTs < nowTs;
}
