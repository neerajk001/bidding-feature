import { supabaseAdmin } from '../config/supabase'
import { sendPaymentConfirmedEmail } from './email.service'

export function buildRazorpayPaymentCompletionUpdate(
  paymentId: string,
  orderId?: string,
  nowIso: string = new Date().toISOString()
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    payment_status: 'completed',
    payment_completed_at: nowIso,
    payment_verified_by_admin: true,
    razorpay_payment_id: paymentId,
    payment_proof_note: 'Verified via Razorpay API'
  }

  if (orderId) {
    updates.razorpay_order_id = orderId
  }

  return updates
}

/** Mark winner as paid (Razorpay), send confirmation email. Idempotent if already completed. */
export async function markWinnerPaidRazorpay(
  winnerId: string,
  paymentId: string,
  orderId?: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: winner, error: fetchErr } = await supabaseAdmin
    .from('winners')
    .select('id, payment_status, bidder_id, auction_id')
    .eq('id', winnerId)
    .single()

  if (fetchErr || !winner) return { ok: false, error: 'Winner not found' }

  const w = winner as any
  if (w.payment_status === 'completed') return { ok: true }

  const updates = buildRazorpayPaymentCompletionUpdate(paymentId, orderId)

  const { error: upErr } = await supabaseAdmin
    .from('winners')
    .update(updates)
    .eq('id', winnerId)

  if (upErr) return { ok: false, error: upErr.message }

  const { data: bidder } = await supabaseAdmin.from('bidders').select('email, name').eq('id', w.bidder_id).single()
  const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()

  if ((bidder as any)?.email) {
    await sendPaymentConfirmedEmail(
      (bidder as any).email,
      (bidder as any)?.name || 'Winner',
      (auction as any)?.title || 'Auction'
    )
  }

  return { ok: true }
}
