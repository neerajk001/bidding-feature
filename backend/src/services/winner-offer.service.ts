import crypto from 'crypto'

const PAYMENT_WINDOW_MS = 12 * 60 * 60 * 1000

type PendingWinnerOfferInput = {
  bidderId: string
  winningAmount: number
  declaredAt?: string
  size?: string | null
  claimToken?: string
  escalationDone?: boolean
}

type WinnerPaymentState = {
  payment_status?: string | null
  payment_due_at?: string | null
}

export function getWinnerPaymentDueAt(baseIso: string = new Date().toISOString()): string {
  const base = new Date(baseIso)
  return new Date(base.getTime() + PAYMENT_WINDOW_MS).toISOString()
}

export function buildPendingWinnerOffer(input: PendingWinnerOfferInput) {
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
    claim_token: input.claimToken || crypto.randomUUID(),
    winner_email_sent_at: null,
    razorpay_order_id: null,
    razorpay_payment_id: null
  }
}

export function buildWinnerNotificationUpdate(sentAt: string = new Date().toISOString()) {
  return {
    winner_email_sent_at: sentAt,
    payment_due_at: getWinnerPaymentDueAt(sentAt)
  }
}

export function isWinnerPaymentExpired(winner: WinnerPaymentState, nowTs: number = Date.now()): boolean {
  if (winner.payment_status !== 'pending' && winner.payment_status !== 'overdue') return false
  if (!winner.payment_due_at) return false

  const dueTs = new Date(winner.payment_due_at).getTime()
  return Number.isFinite(dueTs) && dueTs < nowTs
}
