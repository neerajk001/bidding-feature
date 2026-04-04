import assert from 'node:assert/strict'
import {
  buildPendingWinnerOffer,
  buildWinnerNotificationUpdate,
  getWinnerPaymentDueAt,
  isWinnerPaymentExpired
} from './winner-offer.service'
import { buildRazorpayPaymentCompletionUpdate } from './payment.service'
import { buildPostgrestInList } from './cron.service'
import { sanitizeShipmentPayloadForLogs } from './delhivery.service'

function testWinnerFlowTransitions() {
  const declaredAt = '2026-03-30T10:00:00.000Z'

  const winnerPending = buildPendingWinnerOffer({
    bidderId: 'bidder-1',
    winningAmount: 5100,
    declaredAt,
    size: 'M',
    claimToken: 'claim-1'
  })

  assert.equal(winnerPending.bidder_id, 'bidder-1')
  assert.equal(winnerPending.payment_status, 'pending')
  assert.equal(winnerPending.claim_token, 'claim-1')
  assert.equal(winnerPending.payment_completed_at, null)

  const notification = buildWinnerNotificationUpdate(declaredAt)
  assert.equal(notification.winner_email_sent_at, declaredAt)
  assert.equal(notification.payment_due_at, getWinnerPaymentDueAt(declaredAt))

  const paymentUpdate = buildRazorpayPaymentCompletionUpdate(
    'pay_123',
    'order_123',
    '2026-03-30T11:00:00.000Z'
  )

  assert.equal(paymentUpdate.payment_status, 'completed')
  assert.equal(paymentUpdate.payment_verified_by_admin, true)
  assert.equal(paymentUpdate.razorpay_payment_id, 'pay_123')
  assert.equal(paymentUpdate.razorpay_order_id, 'order_123')

  const escalated = buildPendingWinnerOffer({
    bidderId: 'bidder-2',
    winningAmount: 5200,
    declaredAt: '2026-03-31T00:00:00.000Z',
    size: 'M',
    claimToken: 'claim-2',
    escalationDone: true
  })

  assert.equal(escalated.bidder_id, 'bidder-2')
  assert.equal(escalated.escalation_done, true)
  assert.equal(escalated.payment_status, 'pending')
  assert.equal(escalated.razorpay_order_id, null)
  assert.equal(escalated.razorpay_payment_id, null)
}

function testWinnerExpiryLogic() {
  const dueAt = getWinnerPaymentDueAt('2026-03-30T10:00:00.000Z')
  const afterDueTs = new Date('2026-03-30T23:00:00.000Z').getTime()
  const beforeDueTs = new Date('2026-03-30T20:00:00.000Z').getTime()

  assert.equal(
    isWinnerPaymentExpired({ payment_status: 'pending', payment_due_at: dueAt }, beforeDueTs),
    false
  )
  assert.equal(
    isWinnerPaymentExpired({ payment_status: 'pending', payment_due_at: dueAt }, afterDueTs),
    true
  )
  assert.equal(
    isWinnerPaymentExpired({ payment_status: 'completed', payment_due_at: dueAt }, afterDueTs),
    false
  )
}

function testPostgrestInListFormatter() {
  const formatted = buildPostgrestInList([
    '123e4567-e89b-12d3-a456-426614174000',
    'abc"def'
  ])

  assert.equal(
    formatted,
    '("123e4567-e89b-12d3-a456-426614174000","abc\\"def")'
  )
}

function testShipmentPayloadSanitizer() {
  const sanitized = sanitizeShipmentPayloadForLogs({
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
  })

  const shipment = sanitized.shipments[0]
  assert.equal(shipment.name, '[REDACTED]')
  assert.equal(shipment.add, '[REDACTED]')
  assert.ok(String(shipment.phone).endsWith('10'))
  assert.ok(String(shipment.pin).startsWith('41'))
  assert.equal(shipment.order, 'order_123')
}

function run() {
  testWinnerFlowTransitions()
  testWinnerExpiryLogic()
  testPostgrestInListFormatter()
  testShipmentPayloadSanitizer()
  console.log('winner-flow tests passed')
}

run()
