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
    .select('id, payment_status, bidder_id, auction_id, razorpay_order_id')
    .eq('id', winnerId)
    .single()

  if (fetchErr || !winner) return { ok: false, error: 'Winner not found' }

  const w = winner as any
  if (w.payment_status === 'completed') return { ok: true }
  if (orderId && w.razorpay_order_id && String(w.razorpay_order_id) !== String(orderId)) {
    return { ok: false, error: 'Winner payment order mismatch' }
  }

  const updates = buildRazorpayPaymentCompletionUpdate(paymentId, orderId)

  const { data: updatedWinner, error: upErr } = await supabaseAdmin
    .from('winners')
    .update(updates)
    .eq('id', winnerId)
    .eq('bidder_id', w.bidder_id)
    .in('payment_status', ['pending', 'overdue'])
    .select('id, bidder_id, auction_id')
    .maybeSingle()

  if (upErr) return { ok: false, error: upErr.message }
  if (!updatedWinner) {
    const { data: latestWinner } = await supabaseAdmin
      .from('winners')
      .select('payment_status')
      .eq('id', winnerId)
      .maybeSingle()

    if ((latestWinner as any)?.payment_status === 'completed') {
      return { ok: true }
    }

    return { ok: false, error: 'Winner payment state changed. Please retry verification.' }
  }

  const freshWinner = updatedWinner as any
  const { data: bidder } = await supabaseAdmin
    .from('bidders')
    .select('email, name')
    .eq('id', freshWinner.bidder_id)
    .single()
  const { data: auction } = await supabaseAdmin
    .from('auctions')
    .select('title')
    .eq('id', freshWinner.auction_id)
    .single()

  if ((bidder as any)?.email) {
    await sendPaymentConfirmedEmail(
      (bidder as any).email,
      (bidder as any)?.name || 'Winner',
      (auction as any)?.title || 'Auction'
    )
  }

  return { ok: true }
}
