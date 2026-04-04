"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const winner_offer_service_1 = require("./winner-offer.service");
const payment_service_1 = require("./payment.service");
const cron_service_1 = require("./cron.service");
const delhivery_service_1 = require("./delhivery.service");
function testWinnerFlowTransitions() {
    const declaredAt = '2026-03-30T10:00:00.000Z';
    const winnerPending = (0, winner_offer_service_1.buildPendingWinnerOffer)({
        bidderId: 'bidder-1',
        winningAmount: 5100,
        declaredAt,
        size: 'M',
        claimToken: 'claim-1'
    });
    strict_1.default.equal(winnerPending.bidder_id, 'bidder-1');
    strict_1.default.equal(winnerPending.payment_status, 'pending');
    strict_1.default.equal(winnerPending.claim_token, 'claim-1');
    strict_1.default.equal(winnerPending.payment_completed_at, null);
    const notification = (0, winner_offer_service_1.buildWinnerNotificationUpdate)(declaredAt);
    strict_1.default.equal(notification.winner_email_sent_at, declaredAt);
    strict_1.default.equal(notification.payment_due_at, (0, winner_offer_service_1.getWinnerPaymentDueAt)(declaredAt));
    const paymentUpdate = (0, payment_service_1.buildRazorpayPaymentCompletionUpdate)('pay_123', 'order_123', '2026-03-30T11:00:00.000Z');
    strict_1.default.equal(paymentUpdate.payment_status, 'completed');
    strict_1.default.equal(paymentUpdate.payment_verified_by_admin, true);
    strict_1.default.equal(paymentUpdate.razorpay_payment_id, 'pay_123');
    strict_1.default.equal(paymentUpdate.razorpay_order_id, 'order_123');
    const escalated = (0, winner_offer_service_1.buildPendingWinnerOffer)({
        bidderId: 'bidder-2',
        winningAmount: 5200,
        declaredAt: '2026-03-31T00:00:00.000Z',
        size: 'M',
        claimToken: 'claim-2',
        escalationDone: true
    });
    strict_1.default.equal(escalated.bidder_id, 'bidder-2');
    strict_1.default.equal(escalated.escalation_done, true);
    strict_1.default.equal(escalated.payment_status, 'pending');
    strict_1.default.equal(escalated.razorpay_order_id, null);
    strict_1.default.equal(escalated.razorpay_payment_id, null);
}
function testWinnerExpiryLogic() {
    const dueAt = (0, winner_offer_service_1.getWinnerPaymentDueAt)('2026-03-30T10:00:00.000Z');
    const afterDueTs = new Date('2026-03-30T23:00:00.000Z').getTime();
    const beforeDueTs = new Date('2026-03-30T20:00:00.000Z').getTime();
    strict_1.default.equal((0, winner_offer_service_1.isWinnerPaymentExpired)({ payment_status: 'pending', payment_due_at: dueAt }, beforeDueTs), false);
    strict_1.default.equal((0, winner_offer_service_1.isWinnerPaymentExpired)({ payment_status: 'pending', payment_due_at: dueAt }, afterDueTs), true);
    strict_1.default.equal((0, winner_offer_service_1.isWinnerPaymentExpired)({ payment_status: 'completed', payment_due_at: dueAt }, afterDueTs), false);
}
function testPostgrestInListFormatter() {
    const formatted = (0, cron_service_1.buildPostgrestInList)([
        '123e4567-e89b-12d3-a456-426614174000',
        'abc"def'
    ]);
    strict_1.default.equal(formatted, '("123e4567-e89b-12d3-a456-426614174000","abc\\"def")');
}
function testShipmentPayloadSanitizer() {
    const sanitized = (0, delhivery_service_1.sanitizeShipmentPayloadForLogs)({
        shipments: [
            {
                name: 'Riya Sharma',
                add: '21 Palm Street, Pune',
                pin: '411048',
                city: 'Pune',
                state: 'Maharashtra',
                phone: '9876543210',
                order: 'order_123',
                payment_mode: 'Prepaid'
            }
        ]
    });
    const shipment = sanitized.shipments[0];
    strict_1.default.equal(shipment.name, '[REDACTED]');
    strict_1.default.equal(shipment.add, '[REDACTED]');
    strict_1.default.ok(String(shipment.phone).endsWith('10'));
    strict_1.default.ok(String(shipment.pin).startsWith('41'));
    strict_1.default.equal(shipment.order, 'order_123');
}
function run() {
    testWinnerFlowTransitions();
    testWinnerExpiryLogic();
    testPostgrestInListFormatter();
    testShipmentPayloadSanitizer();
    console.log('winner-flow tests passed');
}
run();
