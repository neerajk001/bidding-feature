import express, { Request, Response } from 'express'
import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { razorpay } from '../config/services'
import { env } from '../config/env'
import { markWinnerPaidRazorpay } from '../services/payment.service'

const router = express.Router()

// Public: get winner claim by token (for payment form)
router.get('/winner/claim', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string)?.trim()
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' })
    }

    const { data: winner, error } = await supabaseAdmin
      .from('winners')
      .select(`
        id, auction_id, winning_amount, payment_due_at, payment_status, size,
        payment_completed_at, payment_proof_note, razorpay_order_id, razorpay_payment_id,
        auction:auctions(title),
        bidder:bidders(name)
      `)
      .eq('claim_token', token)
      .single()

    if (error || !winner) {
      return res.status(404).json({ error: 'Invalid or expired claim link' })
    }

    const w = winner as any

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
        razorpay_payment_id: w.razorpay_payment_id
      })
    }

    return res.json({
      claim: true,
      status: w.payment_status,
      auction_title: w.auction?.title,
      winning_amount: w.winning_amount,
      payment_due_at: w.payment_due_at,
      size: w.size,
      bidder_name: w.bidder?.name,
      razorpay_key_id: razorpay ? env.razorpayKeyId : undefined
    })
  } catch (e) {
    console.error('Winner claim get error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: create Razorpay order for winner (by claim token)
router.post('/winner/create-order', async (req: Request, res: Response) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay is not configured' })
    }

    const { token } = req.body || {}
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' })
    }

    const { data: winner, error } = await supabaseAdmin
      .from('winners')
      .select('id, winning_amount, payment_status, razorpay_order_id')
      .eq('claim_token', token.trim())
      .single()

    if (error || !winner) {
      return res.status(404).json({ error: 'Invalid or expired claim link' })
    }

    const w = winner as any

    if (w.payment_status !== 'pending' && w.payment_status !== 'overdue') {
      return res.status(400).json({ error: 'Payment already processed for this offer.' })
    }

    const amountRupees = Number(w.winning_amount)
    
    if (!Number.isFinite(amountRupees) || amountRupees < 1) {
      return res.status(400).json({ error: 'Invalid winning amount' })
    }

    const amountPaise = Math.round(amountRupees * 100)
    let orderId = w.razorpay_order_id

    if (!orderId) {
      const receipt = `winner_${w.id.replace(/-/g, '_').slice(0, 24)}`
      const order = await (razorpay.orders as any).create({ amount: amountPaise, currency: 'INR', receipt })
      orderId = order.id
      await supabaseAdmin.from('winners').update({ razorpay_order_id: orderId }).eq('id', w.id)
    }

    return res.json({
      key_id: env.razorpayKeyId,
      order_id: orderId,
      amount: amountPaise,
      currency: 'INR'
    })
  } catch (e: any) {
    console.error('Winner create-order error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
})

// Public: verify Razorpay payment and mark winner paid (after frontend checkout success)
router.post('/winner/verify-payment', async (req: Request, res: Response) => {
  try {
    const { token, razorpay_payment_id, razorpay_order_id, instagram_handle } = req.body || {}
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' })
    }

    if (!razorpay_payment_id || !razorpay_order_id) {
      return res.status(400).json({ error: 'razorpay_payment_id and razorpay_order_id required' })
    }

    const { data: winner, error } = await supabaseAdmin
      .from('winners')
      .select('id, payment_status, razorpay_order_id, winning_amount')
      .eq('claim_token', token.trim())
      .single()

    if (error || !winner) {
      return res.status(404).json({ error: 'Invalid or expired claim link' })
    }

    const w = winner as any

    if (w.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order does not match this claim' })
    }

    if (w.payment_status === 'completed') {
      return res.json({ success: true, message: 'Payment already confirmed.' })
    }

    if (razorpay) {
      let payment = await (razorpay.payments as any).fetch(razorpay_payment_id)

      // Many accounts return "authorized" first. Capture it here so proof is persisted immediately.
      if (payment?.status === 'authorized') {
        const amountPaise = Number(payment.amount)
        if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
          return res.status(400).json({ error: 'Invalid winner amount for payment capture.' })
        }

        try {
          payment = await (razorpay.payments as any).capture(
            razorpay_payment_id,
            amountPaise,
            payment.currency || 'INR'
          )
        } catch (captureError) {
          console.warn('[winner.verify-payment] capture attempt failed, re-fetching payment status', captureError)
          payment = await (razorpay.payments as any).fetch(razorpay_payment_id)
        }
      }

      if (!payment || payment.status !== 'captured') {
        // Fallback: sometimes capture settles with delay; verify from order payment list.
        try {
          const orderPayments = await (razorpay.orders as any).fetchPayments(razorpay_order_id)
          const items = Array.isArray(orderPayments?.items) ? orderPayments.items : []
          const capturedById = items.find((p: any) => String(p?.id) === String(razorpay_payment_id) && p?.status === 'captured')
          const anyCaptured = items.find((p: any) => p?.status === 'captured')
          payment = capturedById || anyCaptured || payment
        } catch (orderFetchError) {
          console.warn('[winner.verify-payment] order payment lookup failed', orderFetchError)
        }
      }

      if (!payment || payment.status !== 'captured') {
        return res.status(400).json({
          error: `Payment is ${payment?.status || 'unknown'}. Please wait a minute and retry verification.`
        })
      }

      if (String(payment.order_id) !== String(razorpay_order_id)) {
        return res.status(400).json({ error: 'Payment order mismatch' })
      }
    }

    if (instagram_handle != null && String(instagram_handle).trim()) {
      await supabaseAdmin
        .from('winners')
        .update({ instagram_handle: String(instagram_handle).trim() })
        .eq('id', w.id)
    }

    const result = await markWinnerPaidRazorpay(w.id, razorpay_payment_id, razorpay_order_id)
    
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to update' })
    }

    return res.json({
      success: true,
      message: 'Payment confirmed. You will receive a confirmation email shortly.',
      payment_status: 'completed',
      razorpay_payment_id,
      razorpay_order_id
    })
  } catch (e: any) {
    console.error('Winner verify-payment error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
})

// Razorpay webhook: payment.captured → mark winner paid (source of truth; idempotent)
router.post('/winner/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody as Buffer | undefined
    
    if (!rawBody || !rawBody.length) {
      return res.status(400).send('Missing body')
    }

    const signature = req.headers['x-razorpay-signature'] as string
    
    if (!env.razorpayWebhookSecret || !signature) {
      return res.status(400).send('Missing signature or webhook secret')
    }

    const expectedSig = crypto.createHmac('sha256', env.razorpayWebhookSecret).update(rawBody).digest('hex')
    
    if (expectedSig !== signature) {
      return res.status(400).send('Invalid signature')
    }

    const payload = JSON.parse(rawBody.toString('utf8'))
    
    if (payload.event !== 'payment.captured') {
      return res.status(200).send('OK')
    }

    const payment = payload.payload?.payment?.entity
    
    if (!payment?.id || !payment?.order_id) {
      return res.status(200).send('OK')
    }

    const orderId = payment.order_id
    const { data: winner } = await supabaseAdmin
      .from('winners')
      .select('id')
      .eq('razorpay_order_id', orderId)
      .maybeSingle()

    if (winner) {
      await markWinnerPaidRazorpay(winner.id, payment.id, payment.order_id)
    }

    return res.status(200).send('OK')
  } catch (e) {
    console.error('Winner webhook error:', e)
    return res.status(500).send('Error')
  }
})

export default router
