import { supabaseAdmin } from '../config/supabase'
import { sendPaymentConfirmedEmail } from './email.service'

/** Mark winner as paid (Razorpay), send confirmation email. Idempotent if already completed. */
export async function markWinnerPaidRazorpay(winnerId: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: winner, error: fetchErr } = await supabaseAdmin
    .from('winners')
    .select('id, payment_status, bidder_id, auction_id')
    .eq('id', winnerId)
    .single()

  if (fetchErr || !winner) return { ok: false, error: 'Winner not found' }

  const w = winner as any
  if (w.payment_status === 'completed') return { ok: true }

  const now = new Date().toISOString()
  const { error: upErr } = await supabaseAdmin
    .from('winners')
    .update({
      payment_status: 'completed',
      payment_completed_at: now,
      payment_verified_by_admin: true,
      razorpay_payment_id: paymentId
    })
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
