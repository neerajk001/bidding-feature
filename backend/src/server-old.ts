
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { Resend } from 'resend'
import { getToken } from 'next-auth/jwt'
import path from 'path'
import dotenv from 'dotenv'
import Razorpay from 'razorpay'

// Load env: backend folder first, then frontend/root (so backend/.env works too)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '..', 'frontend', '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '..', 'frontend', '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') })

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
// Capture raw body for Razorpay webhook (signature verification requires unmodified body)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl === '/api/winner/webhook' && req.method === 'POST') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      (req as any).rawBody = Buffer.concat(chunks)
      next()
    })
  } else {
    next()
  }
})
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || ''
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || ''
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000)
      }).catch((err: any) => {
        if (err?.name === 'AbortError') {
          console.error('Supabase request timeout:', url)
        } else if (err?.code === 'ENOTFOUND' || err?.cause?.code === 'ENOTFOUND') {
          console.error('Supabase DNS lookup failed. Check network connection or Supabase project status.')
        } else {
          console.error('Supabase fetch error:', err?.message || err)
        }
        throw err
      })
    }
  }
})

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email?: string | null) {
  if (!email) return false
  if (adminEmails.length === 0) return false
  return adminEmails.includes(email.toLowerCase())
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await getToken({
      req: { headers: req.headers, cookies: req.cookies } as any,
      secret: process.env.NEXTAUTH_SECRET
    })
    const email = token?.email as string | undefined

    if (!token || !isAdminEmail(email)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

type FinalizeResult = {
  endedAuctionIds: string[]
  errors: string[]
}

async function finalizeEndedAuctions(now: Date = new Date()): Promise<FinalizeResult> {
  const endedAuctionIds: string[] = []
  const errors: string[] = []
  const nowIso = now.toISOString()

  const { data: auctions, error } = await supabaseAdmin
    .from('auctions')
    .select('id, title, bidding_end_time, available_sizes')
    .eq('status', 'live')
    .lt('bidding_end_time', nowIso)
    .order('bidding_end_time', { ascending: true })

  if (error) {
    errors.push(`Failed to load ended auctions: ${error.message}`)
    return { endedAuctionIds, errors }
  }

  if (!auctions || auctions.length === 0) {
    return { endedAuctionIds, errors }
  }

  for (const auction of auctions) {
    try {
      const sizes: string[] = Array.isArray(auction.available_sizes) ? auction.available_sizes : []

      if (sizes.length > 0) {
        for (const size of sizes) {
          const { data: highestBid, error: highestBidError } = await supabaseAdmin
            .from('bids')
            .select('amount, bidder_id')
            .eq('auction_id', auction.id)
            .eq('size', size)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (highestBidError) {
            errors.push(`Failed to calculate winner for ${auction.id} size ${size}: ${highestBidError.message}`)
            continue
          }

          const winningAmount = Number(highestBid?.amount ?? 0)
          if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
            const paymentDueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auction.id,
                  bidder_id: highestBid.bidder_id,
                  winning_amount: winningAmount,
                  declared_at: nowIso,
                  size,
                  payment_due_at: paymentDueAt,
                  payment_status: 'pending',
                  claim_token: crypto.randomUUID()
                },
                { onConflict: 'auction_id,size' }
              )

            if (winnerError) {
              errors.push(`Failed to save winner for ${auction.id} size ${size}: ${winnerError.message}`)
            }
          }
        }
      } else {
        const { data: highestBid, error: highestBidError } = await supabaseAdmin
          .from('bids')
          .select('amount, bidder_id')
          .eq('auction_id', auction.id)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (highestBidError) {
          errors.push(`Failed to calculate winner for ${auction.id}: ${highestBidError.message}`)
          continue
        }

        const winningAmount = Number(highestBid?.amount ?? 0)
        if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
          const paymentDueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString()
          const { error: winnerError } = await supabaseAdmin
            .from('winners')
            .upsert(
              {
                auction_id: auction.id,
                bidder_id: highestBid.bidder_id,
                winning_amount: winningAmount,
                declared_at: nowIso,
                size: null,
                payment_due_at: paymentDueAt,
                payment_status: 'pending',
                claim_token: crypto.randomUUID()
              },
              { onConflict: 'auction_id,size' }
            )

          if (winnerError) {
            errors.push(`Failed to save winner for ${auction.id}: ${winnerError.message}`)
            continue
          }
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('auctions')
        .update({ status: 'ended' })
        .eq('id', auction.id)

      if (updateError) {
        errors.push(`Failed to mark auction ended for ${auction.id}: ${updateError.message}`)
        continue
      }

      endedAuctionIds.push(auction.id)

      // Send winner email(s) for winners not yet notified (pending, claim_token set)
      const { data: winnersToNotify } = await supabaseAdmin
        .from('winners')
        .select('id, bidder_id, winning_amount, claim_token, size')
        .eq('auction_id', auction.id)
        .eq('payment_status', 'pending')
        .not('claim_token', 'is', null)
        .is('winner_email_sent_at', null)

      if (winnersToNotify && winnersToNotify.length > 0) {
        for (const w of winnersToNotify) {
          const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single()
          const email = (bidder as any)?.email
          if (email && w.claim_token) {
            const sent = await sendWinnerEmail({
              to: email,
              winnerName: (bidder as any)?.name || 'Winner',
              auctionTitle: auction.title || 'Auction',
              winningAmount: Number(w.winning_amount),
              claimToken: w.claim_token,
              isEscalation: false
            })
            if (sent) {
              await supabaseAdmin.from('winners').update({ winner_email_sent_at: nowIso }).eq('id', w.id)
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to finalize auction ${auction.id}: ${String(err)}`)
    }
  }

  return { endedAuctionIds, errors }
}

function setNoCache(res: Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
}

function maybeUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'] || ''
  if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
    return upload.any()(req, res, next)
  }
  return next()
}

const resend = new Resend(process.env.RESEND_API_KEY)

const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000'

async function sendWinnerEmail(params: {
  to: string
  winnerName: string
  auctionTitle: string
  winningAmount: number
  claimToken: string
  isEscalation?: boolean
}): Promise<boolean> {
  const { to, winnerName, auctionTitle, winningAmount, claimToken, isEscalation } = params
  const claimUrl = `${appBaseUrl}/winner/claim?token=${encodeURIComponent(claimToken)}`
  const subject = isEscalation
    ? `You're now the winner – ${auctionTitle} – Pay within 12 hours`
    : `You won! ${auctionTitle} – Pay within 12 hours`
  const intro = isEscalation
    ? `The previous winner did not complete payment. The item is now offered to you.`
    : `Congratulations! You won this lot.`
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">${subject}</h2>
          <p>Hello ${winnerName},</p>
          <p>${intro}</p>
          <p><strong>Winning amount: ₹${Number(winningAmount).toLocaleString()}</strong></p>
          <p>Payment must be completed within <strong>12 hours</strong> or the offer will be cancelled.</p>
          <p><strong>Payment methods:</strong></p>
          <ul>
            <li>UPI: <code>9096068280-2@ybl</code></li>
            <li>GPay: Scanner will be provided when you claim.</li>
          </ul>
          <p>Share your payment details and optional Instagram handle here:</p>
          <p><a href="${claimUrl}" style="display: inline-block; padding: 12px 24px; background: #800000; color: #fff; text-decoration: none; border-radius: 8px;">Complete payment & share details</a></p>
          <p style="color: #666; font-size: 14px;">Shipping is included. Dispatch in 2–3 working days, Pan-India.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions</p>
        </div>
      `
    })
    return true
  } catch (e) {
    console.error('Winner email send failed:', e)
    return false
  }
}

async function sendPaymentConfirmedEmail(to: string, winnerName: string, auctionTitle: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject: `Payment received – ${auctionTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">Payment received</h2>
          <p>Hello ${winnerName},</p>
          <p>We have received your payment for <strong>${auctionTitle}</strong>.</p>
          <p>Your order will be dispatched within 2–3 working days. Pan-India shipping is included.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions</p>
        </div>
      `
    })
    return true
  } catch (e) {
    console.error('Payment confirmed email failed:', e)
    return false
  }
}

/** Mark winner as paid (Razorpay), send confirmation email. Idempotent if already completed. */
async function markWinnerPaidRazorpay(winnerId: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
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

const api = express.Router()

// Health check: always returns JSON so you can verify Supabase connection
api.get('/health', async (_req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const hasEnv = Boolean(supabaseUrl && supabaseKey)

  if (!hasEnv) {
    return res.status(200).json({
      ok: false,
      backend: 'running',
      supabase: 'not_configured',
      message: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env or frontend/.env.local'
    })
  }

  try {
    const { error } = await supabaseAdmin.from('auctions').select('id').limit(1)
    if (error) {
      return res.status(200).json({
        ok: false,
        backend: 'running',
        supabase: 'error',
        message: error.message,
        hint: 'Check Supabase URL, service role key, and that the auctions table exists.'
      })
    }
    return res.status(200).json({
      ok: true,
      backend: 'running',
      supabase: 'connected'
    })
  } catch (err: any) {
    return res.status(200).json({
      ok: false,
      backend: 'running',
      supabase: 'error',
      message: err?.message || 'Supabase request failed',
      hint: 'Check network and Supabase project status.'
    })
  }
})

// Public: List auctions
api.get('/auctions', async (req: Request, res: Response) => {
  try {
    await finalizeEndedAuctions()

    const includeEnded = req.query.includeEnded === 'true'
    const statuses = includeEnded ? ['live', 'upcoming', 'ended'] : ['live', 'upcoming']

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment, base_price, available_sizes')
      .in('status', statuses)
      .order('bidding_start_time', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    const auctionsWithBids = await Promise.all(
      (auctions || []).map(async (auction: any) => {
        const { data: highestBid } = await supabaseAdmin
          .from('bids')
          .select('amount, bidder:bidder_id(name)')
          .eq('auction_id', auction.id)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { count } = await supabaseAdmin
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('auction_id', auction.id)

        let winnersList: { size: string | null; winning_amount: number; winner_name: string | null; declared_at: string | null }[] = []
        let winningAmount: number | null = null
        let winnerName: string | null = null
        let winnerDeclaredAt: string | null = null

        if (auction.status === 'ended') {
          const { data: winnersRows } = await supabaseAdmin
            .from('winners')
            .select('size, winning_amount, declared_at, bidder:bidder_id(name)')
            .eq('auction_id', auction.id)

          if (winnersRows && winnersRows.length > 0) {
            winnersList = winnersRows.map((w: any) => {
              const name = Array.isArray(w?.bidder) ? (w.bidder[0] as any)?.name : (w?.bidder as any)?.name ?? null
              return {
                size: w.size ?? null,
                winning_amount: Number(w.winning_amount) ?? 0,
                winner_name: name,
                declared_at: w.declared_at ?? null
              }
            })
            const first = winnersList[0]
            winningAmount = first?.winning_amount ?? null
            winnerName = first?.winner_name ?? null
            winnerDeclaredAt = first?.declared_at ?? null
          }
        }

        const displayAmount = winningAmount ?? highestBid?.amount ?? null
        const displayName = winnerName ?? (Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as any)?.name : (highestBid?.bidder as any)?.name) ?? null

        return {
          ...auction,
          current_highest_bid: displayAmount,
          highest_bidder_name: displayName,
          total_bids: count ?? 0,
          winner_name: winnerName,
          winning_amount: winningAmount,
          winner_declared_at: winnerDeclaredAt,
          winners_by_size: winnersList
        }
      })
    )

    setNoCache(res)
    return res.json({ success: true, auctions: auctionsWithBids })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Active auction
api.get('/auction/active', async (_req: Request, res: Response) => {
  try {
    await finalizeEndedAuctions()

    const now = new Date().toISOString()

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, registration_end_time, bidding_start_time, bidding_end_time')
      .eq('status', 'live')
      .order('bidding_start_time', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    if (!auctions || auctions.length === 0) {
      setNoCache(res)
      return res.json({ exists: false })
    }

    const liveAuction = auctions.find((auction: any) => {
      return now >= auction.bidding_start_time && now <= auction.bidding_end_time
    })

    if (liveAuction) {
      setNoCache(res)
      return res.json({
        exists: true,
        auction_id: liveAuction.id,
        phase: 'live',
        cta: 'Place Bid'
      })
    }

    const registrationAuction = auctions.find((auction: any) => {
      return now < auction.registration_end_time && now < auction.bidding_start_time
    })

    if (registrationAuction) {
      setNoCache(res)
      return res.json({
        exists: true,
        auction_id: registrationAuction.id,
        phase: 'registration',
        cta: 'Register Now'
      })
    }

    setNoCache(res)
    return res.json({ exists: false })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Auction by product ID
api.get('/auction/product/:product_id', async (req: Request, res: Response) => {
  try {
    await finalizeEndedAuctions()

    const product_id = req.params.product_id

    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    const { data: auction, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment')
      .eq('product_id', product_id)
      .eq('status', 'live')
      .single()

    if (error || !auction) {
      return res.status(404).json({ error: 'No live auction found for this product' })
    }

    const { data: highestBid } = await supabaseAdmin
      .from('bids')
      .select('amount, bidder:bidder_id(name)')
      .eq('auction_id', auction.id)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { amount: number; bidder: { name: string } | { name: string }[] | null } | null }

    return res.json({
      ...auction,
      current_highest_bid: highestBid?.amount ?? null,
      highest_bidder_name: Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as any)?.name : (highestBid?.bidder as any)?.name ?? null
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Auction by ID (RPC)
api.get('/auction/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id

    if (!id) {
      return res.status(400).json({ error: 'Auction ID is required' })
    }

    await finalizeEndedAuctions()

    const { data, error } = await supabaseAdmin.rpc('get_auction_details', {
      p_auction_id: id
    })

    if (error) {
      if (error.message.includes('Auction not found')) {
        return res.status(404).json({ error: 'Auction not found' })
      }
      console.error('RPC Error fetching auction:', error)
      return res.status(500).json({ error: 'Failed to load auction details' })
    }

    if (!data || data.error) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const sizes = data.available_sizes
    const hasSizes = Array.isArray(sizes) && sizes.length > 0
    if (data.status === 'live' && hasSizes) {
      const { data: bids } = await supabaseAdmin
        .from('bids')
        .select('size, amount, bidder:bidder_id(name)')
        .eq('auction_id', id)

      const bySize: Record<string, { amount: number; bidder_name: string | null }> = {}
      for (const b of bids || []) {
        const s = b.size ?? ''
        if (!sizes.includes(s)) continue
        const amt = Number(b.amount)
        const bidder = b.bidder as { name?: string } | { name?: string }[] | null
        const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null
        if (!bySize[s] || amt > bySize[s].amount) {
          bySize[s] = { amount: amt, bidder_name: name }
        }
      }
      data.highest_bids_by_size = sizes.map((s: string) => ({ size: s, amount: bySize[s]?.amount ?? 0, bidder_name: bySize[s]?.bidder_name ?? null }))
    }

    setNoCache(res)
    return res.json(data)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
// Public: Auction widget
api.get('/auction-widget', async (_req: Request, res: Response) => {
  const widgetScript = `
(function() {
  'use strict';
  
  const API_BASE = '${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}';
  const SUPABASE_URL = '${process.env.NEXT_PUBLIC_SUPABASE_URL}';
  const SUPABASE_ANON_KEY = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';
  let currentProductId = null;
  let widgetState = 'loading'; // loading | otp | verifyOtp | register | bid
  let verifiedPhone = null;
  let verifiedEmail = null;
  let verifiedName = null;
  
  // Get product ID from merchant injection
  currentProductId = window.AUCTION_PRODUCT_ID;
  if (!currentProductId) {
    console.log('Auction widget: No product ID found. Merchant must inject window.AUCTION_PRODUCT_ID');
    return;
  }
  
  // Check if auction exists for this product
  fetch(API_BASE + '/api/auction/product/' + currentProductId)
    .then(res => res.json())
    .then(auction => {
      if (auction.id && auction.status === 'live') {
        initAuctionWidget(auction);
      }
    })
    .catch(err => console.log('Auction widget: No auction found'));
  
  function initAuctionWidget(auction) {
    // Check if registration window is closed
    const now = new Date();
    const registrationEnd = new Date(auction.registration_end_time);
    const isRegistrationClosed = now > registrationEnd;
    
    // Check for existing verified user
    const savedPhone = localStorage.getItem('auction_user_phone');
    const savedEmail = localStorage.getItem('auction_user_email');
    const savedName = localStorage.getItem('auction_user_name');
    const existingBidderId = localStorage.getItem('bidder_' + auction.id);
    
    // Create widget HTML
    const container = document.createElement('div');
    container.id = 'auction-widget';
    container.className = 'auction-widget-container';
    container.innerHTML = '<style>' +
      '.auction-widget-container { border: 2px solid #ff6b6b;  padding: 24px; margin: 24px 0; border-radius: 8px; background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%); }' +
      '.auction-title { margin: 0 0 16px 0; font-size: 24px; font-weight: bold; color: #333; }' +
      '.auction-current-bid { font-size: 32px; font-weight: bold; color: #ff6b6b; margin: 16px 0; }' +
      '.auction-info { color: #666; margin: 8px 0; font-size: 14px; }' +
      '.auction-btn { border: none; padding: 14px 28px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 600; margin-top: 16px; transition: transform 0.2s; }' +
      '.auction-btn:hover { transform: translateY(-2px); }' +
      '.auction-btn-primary { background: #ff6b6b; color: white; }' +
      '.auction-btn-success { background: #51cf66; color: white; }' +
      '.auction-input { width: 100%; padding: 12px; margin: 8px 0; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }' +
      '.auction-input:focus { outline: none; border-color: #ff6b6b; }' +
      '.auction-message { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 14px; }' +
      '.auction-message.success { background: #d3f9d8; color: #2b8a3e; }' +
      '.auction-message.error { background: #ffe3e3; color: #c92a2a; }' +
      '.winner-section { background: #f8f9fa; border-left: 4px solid #339af0; padding: 16px; margin: 16px 0; border-radius: 4px; }' +
      '.winner-label { font-weight: bold; color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }' +
      '.winner-name { font-size: 18px; font-weight: bold; color: #1c7ed6; }' +
      '.winner-amount { color: #868e96; font-size: 14px; }' +
      '</style>' +
      '<div>' +
      '<h3 class="auction-title">?? Live Auction</h3>' +
      '<div id="winner-section-container"></div>' +
      '<div class="auction-current-bid" id="auction-current-bid">Current Bid: $' + (auction.current_highest_bid || 0).toFixed(2) + '</div>' +
      '<div class="auction-info">' +
      '<div>? Ends: ' + new Date(auction.bidding_end_time).toLocaleString() + '</div>' +
      '<div>?? Min. increment: $' + auction.min_increment.toFixed(2) + '</div>' +
      '</div>' +
      '<div id="auction-register-section"><button class="auction-btn auction-btn-primary" id="register-btn">Register to Bid</button></div>' +
      '<div id="auction-otp-form" style="display: none;">' +
      '<input type="text" class="auction-input" id="otp-name" placeholder="Full Name" required>' +
      '<input type="email" class="auction-input" id="otp-email" placeholder="Email Address" required>' +
      '<input type="tel" class="auction-input" id="phone-number" placeholder="+1234567890" required>' +
      '<button class="auction-btn auction-btn-primary" id="send-otp">Send OTP</button>' +
      '</div>' +
      '<div id="auction-verify-form" style="display: none;">' +
      '<input type="text" class="auction-input" id="otp-code" placeholder="Enter 6-digit OTP" required>' +
      '<button class="auction-btn auction-btn-success" id="verify-otp">Verify OTP</button>' +
      '</div>' +
      '<div id="auction-registration-form" style="display: none;">' +
      '<input type="text" class="auction-input" id="bidder-name" placeholder="Full Name" required>' +
      '<input type="email" class="auction-input" id="bidder-email" placeholder="Email Address" required>' +
      '<button class="auction-btn auction-btn-success" id="submit-registration">Submit Registration</button>' +
      '</div>' +
      '<div id="auction-bid-form" style="display: none;">' +
      '<input type="number" class="auction-input" id="bid-amount" placeholder="Enter Bid Amount" step="0.01" required>' +
      '<button class="auction-btn auction-btn-primary" id="submit-bid">Place Bid</button>' +
      '</div>' +
      '<div id="auction-message"></div>' +
      '</div>';

  // Insert after product form
  const productForm = document.querySelector('form[action*="/cart/add"]') ||
    document.querySelector('.product-form') ||
    document.querySelector('.product__info-container');

  if (productForm && productForm.parentNode) {
    productForm.parentNode.insertBefore(container, productForm.nextSibling);
  } else {
    const productSection = document.querySelector('.product');
    if (productSection) {
      productSection.appendChild(container);
    }
  }

  updateWinnerDisplay(auction);
  setupEventHandlers(auction, isRegistrationClosed);
  setupRealtimeUpdates(auction.id);
  
  // Auto-initialize state based on saved data
  // Populate verified variables from localStorage if available
  if (savedPhone) verifiedPhone = savedPhone;
  if (savedEmail) verifiedEmail = savedEmail;
  if (savedName) verifiedName = savedName;
  
  if (isRegistrationClosed) {
    if (existingBidderId) {
      // User is registered, allow bidding
      widgetState = 'bid';
      transitionToState('bid');
    } else {
      // User is NOT registered, block access
      widgetState = 'loading';
      showMessage('?? Registration window closed. You cannot register for this auction.', 'error');
      document.getElementById('auction-register-section').style.display = 'none';
    }
  } else if (existingBidderId) {
    widgetState = 'bid';
    transitionToState('bid');
  } else if (savedPhone && savedEmail && savedName) {
    widgetState = 'register';
    transitionToState('register');
    document.getElementById('bidder-name').value = savedName;
    document.getElementById('bidder-email').value = savedEmail;
  }
}

function updateWinnerDisplay(auction) {
  const container = document.getElementById('winner-section-container');
  if (!container) return;

  let html = '';
  const highestBid = auction.current_highest_bid || 0;
  const leaderName = auction.highest_bidder_name || 'No bids yet';

  if (auction.status === 'ended') {
    html = '<div class="winner-section" style="border-color: #2b8a3e; background: #ebfbee;">' +
      '<div class="winner-label" style="color: #2b8a3e;">?? Ultimate Winner</div>' +
      '<div class="winner-name" style="color: #2b8a3e;">' + leaderName + '</div>' +
      '<div class="winner-amount">Winning Bid: $' + highestBid.toFixed(2) + '</div>' +
      '</div>';
  } else if (auction.status === 'live' && auction.highest_bidder_name) {
    html = '<div class="winner-section">' +
      '<div class="winner-label">?? Current Leader</div>' +
      '<div class="winner-name">' + leaderName + '</div>' +
      '<div class="winner-amount">Bid: $' + highestBid.toFixed(2) + '</div>' +
      '</div>';
  } else {
    html = '<div class="winner-section" style="border-color: #adb5bd;">' +
      '<div class="winner-label">Starting Soon</div>' +
      '<div class="winner-amount">No winner yet</div>' +
      '</div>';
  }

  container.innerHTML = html;
}

function transitionToState(newState) {
  widgetState = newState;
  
  document.getElementById('auction-register-section').style.display = 'none';
  document.getElementById('auction-otp-form').style.display = 'none';
  document.getElementById('auction-verify-form').style.display = 'none';
  document.getElementById('auction-registration-form').style.display = 'none';
  document.getElementById('auction-bid-form').style.display = 'none';
  
  if (newState === 'otp') {
    document.getElementById('auction-otp-form').style.display = 'block';
  } else if (newState === 'verifyOtp') {
    document.getElementById('auction-verify-form').style.display = 'block';
  } else if (newState === 'register') {
    document.getElementById('auction-registration-form').style.display = 'block';
  } else if (newState === 'bid') {
    document.getElementById('auction-bid-form').style.display = 'block';
  }
}

function setupEventHandlers(auction, isRegistrationClosed) {
  const registerBtn = document.getElementById('register-btn');
  const sendOtpBtn = document.getElementById('send-otp');
  const verifyOtpBtn = document.getElementById('verify-otp');
  const submitRegistrationBtn = document.getElementById('submit-registration');
  const submitBidBtn = document.getElementById('submit-bid');
  
  // Step 1: Show OTP form or skip if already verified
  if (registerBtn) {
    registerBtn.onclick = async () => {
      if (isRegistrationClosed) {
        showMessage('?? Registration window closed', 'error');
        return;
      }
      
      // Check if user is already verified in backend
      const savedPhone = localStorage.getItem('auction_user_phone');
      const savedEmail = localStorage.getItem('auction_user_email');
      if (savedPhone && savedEmail) {
        try {
          const checkRes = await fetch(API_BASE + '/api/auth/check-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: savedPhone, email: savedEmail })
          });
          const checkData = await checkRes.json();
          
          if (checkData.verified) {
            verifiedPhone = savedPhone;
            const u = checkData.user || {};
            verifiedEmail = u.email || checkData.email || savedEmail || '';
            verifiedName = u.name || checkData.name || localStorage.getItem('auction_user_name') || '';
            transitionToState('register');
            if (verifiedName) document.getElementById('bidder-name').value = verifiedName;
            if (verifiedEmail) document.getElementById('bidder-email').value = verifiedEmail;
            showMessage('? Welcome back!', 'success');
            return;
          }
        } catch (err) {
          console.log('Check user failed, proceeding with OTP');
        }
      }
      
      transitionToState('otp');

      // Prefill OTP form with any saved details
      const otpNameInput = document.getElementById('otp-name');
      const otpEmailInput = document.getElementById('otp-email');
      if (otpNameInput && verifiedName) otpNameInput.value = verifiedName;
      if (otpEmailInput && verifiedEmail) otpEmailInput.value = verifiedEmail;
    };
  }

  // Step 2: Send OTP (backend + Firebase)
  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const nameInput = document.getElementById('otp-name');
      const emailInput = document.getElementById('otp-email');
      const phoneInput = document.getElementById('phone-number');
      if (!nameInput || !emailInput || !phoneInput) return;
      
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const phone = phoneInput.value.trim();
      if (!name || !email || !phone) {
        showMessage('Please fill name, email, and phone number', 'error');
        return;
      }

      try {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'Sending...';
        
        // Call backend send-otp first
        const backendRes = await fetch(API_BASE + '/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, name, email })
        });
        
        const backendData = await backendRes.json();
        if (!backendData.success) {
          throw new Error(backendData.error || 'Backend OTP send failed');
        }
        
        verifiedPhone = phone;
        verifiedName = name;
        verifiedEmail = email;
        
        transitionToState('verifyOtp');
        showMessage('? OTP sent to ' + phone, 'success');
      } catch (err) {
        showMessage('Failed to send OTP: ' + err.message, 'error');
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Send OTP';
      }
    };
  }

  // Step 3: Verify OTP (Firebase + backend)
  if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async () => {
      const otpInput = document.getElementById('otp-code');
      if (!otpInput) return;
      
      const otp = otpInput.value.trim();
      if (!otp || otp.length !== 6) {
        showMessage('Please enter 6-digit OTP', 'error');
        return;
      }

      if (!verifiedName || !verifiedEmail || !verifiedPhone) {
        showMessage('Name, email, and phone are required before verification', 'error');
        return;
      }

      try {
        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = 'Verifying...';
        
        // Verify with backend (REQUIRED) - send code, phone, name, email only
        const backendRes = await fetch(API_BASE + '/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            code: otp,
            phone: verifiedPhone,
            name: verifiedName,
            email: verifiedEmail
          })
        });
        
        const backendData = await backendRes.json();
        if (!backendData.success) {
          throw new Error(backendData.error || 'Backend verification failed');
        }
        
        // Save verified user to localStorage
        localStorage.setItem('auction_user_phone', verifiedPhone);
        if (verifiedName) localStorage.setItem('auction_user_name', verifiedName);
        if (verifiedEmail) localStorage.setItem('auction_user_email', verifiedEmail);
        
        const registerNameInput = document.getElementById('bidder-name');
        const registerEmailInput = document.getElementById('bidder-email');
        if (registerNameInput && verifiedName) registerNameInput.value = verifiedName;
        if (registerEmailInput && verifiedEmail) registerEmailInput.value = verifiedEmail;
        transitionToState('register');
        showMessage('? Phone verified! Complete your registration.', 'success');
      } catch (err) {
        showMessage('Invalid OTP: ' + err.message, 'error');
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = 'Verify OTP';
      }
    };
  }

  // Step 4: Submit registration
  if (submitRegistrationBtn) {
    submitRegistrationBtn.onclick = async () => {
      const nameInput = document.getElementById('bidder-name');
      const emailInput = document.getElementById('bidder-email');
      
      if (!nameInput || !emailInput) return;
      
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();

      if (!name || !email) {
        showMessage('Please fill all fields', 'error');
        return;
      }

      if (!verifiedPhone) {
        showMessage('Phone verification required', 'error');
        transitionToState('otp');
        return;
      }

      try {
        submitRegistrationBtn.disabled = true;
        submitRegistrationBtn.textContent = 'Registering...';
        
        const res = await fetch(API_BASE + '/api/register-bidder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auction_id: auction.id, name, phone: verifiedPhone, email })
        });

        const data = await res.json();

        if (data.success) {
          localStorage.setItem('bidder_' + auction.id, data.bidder_id);
          localStorage.setItem('auction_user_email', email);
          localStorage.setItem('auction_user_name', name);
          
          transitionToState('bid');
          showMessage('? Registration successful! You can now place bids.', 'success');
        } else {
          showMessage(data.error || 'Registration failed', 'error');
          submitRegistrationBtn.disabled = false;
          submitRegistrationBtn.textContent = 'Submit Registration';
        }
      } catch (err) {
        showMessage('Network error. Please try again.', 'error');
        submitRegistrationBtn.disabled = false;
        submitRegistrationBtn.textContent = 'Submit Registration';
      }
    };
  }

  // Step 5: Place bid
  if (submitBidBtn) {
    submitBidBtn.onclick = async () => {
      const bidderId = localStorage.getItem('bidder_' + auction.id);
      const amountInput = document.getElementById('bid-amount');
      
      if (!amountInput) return;
      const amount = parseFloat(amountInput.value);

      if (!bidderId) {
        showMessage('Please register first', 'error');
        transitionToState('otp');
        return;
      }

      if (!amount || amount <= 0) {
        showMessage('Please enter a valid bid amount', 'error');
        return;
      }

      try {
        submitBidBtn.disabled = true;
        submitBidBtn.textContent = 'Placing bid...';
        
        const res = await fetch(API_BASE + '/api/place-bid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auction_id: auction.id,
            bidder_id: bidderId,
            amount
          })
        });

        const data = await res.json();

        if (data.success) {
          amountInput.value = '';
          showMessage('? Bid placed successfully!', 'success');
        } else {
          showMessage(data.error || 'Bid failed', 'error');
        }
        
        submitBidBtn.disabled = false;
        submitBidBtn.textContent = 'Place Bid';
      } catch (err) {
        showMessage('Network error. Please try again.', 'error');
        submitBidBtn.disabled = false;
        submitBidBtn.textContent = 'Place Bid';
      }
    };
  }
}

function checkExistingRegistration(auctionId) {
  const bidderId = localStorage.getItem('bidder_' + auctionId);
  if (bidderId) {
    const registerSection = document.getElementById('auction-register-section');
    const bidSection = document.getElementById('auction-bid-form');
    if (registerSection) registerSection.style.display = 'none';
    if (bidSection) bidSection.style.display = 'block';
  }
}

function showMessage(msg, type) {
  const el = document.getElementById('auction-message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auction-message ' + type;
  el.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      el.style.display = 'none';
    }, 5000);
  }
}

function setupRealtimeUpdates(auctionId) {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.onload = () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    supabase
      .channel('auction-bids-' + auctionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: 'auction_id=eq.' + auctionId
      }, (payload) => {
        const newBid = payload.new;
        if (!newBid || !newBid.amount) return;

        // Update price immediately
        const priceEl = document.getElementById('auction-current-bid');
        if (priceEl) {
          priceEl.textContent = 'Current Bid: $' + parseFloat(newBid.amount).toFixed(2);
        }
        showMessage('?? New bid placed: $' + parseFloat(newBid.amount).toFixed(2), 'success');

        // Re-fetch auction details to update "Current Leader" name
        fetch(API_BASE + '/api/auction/product/' + currentProductId)
          .then(res => res.json())
          .then(updatedAuction => {
            updateWinnerDisplay(updatedAuction);
          });
      })
      .subscribe();
  };
  document.head.appendChild(script);
}
 }) ();
`;

  return res
    .set({
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    })
    .send(widgetScript)
})

// Public: Auth check user
api.post('/auth/check-user', async (req: Request, res: Response) => {
  try {
    const { phone, email } = req.body || {}

    if (!phone && !email) {
      return res.status(400).json({ error: 'Phone or email is required' })
    }

    const normalizedPhone = phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null

    let query = supabaseAdmin
      .from('users')
      .select('id, phone_verified, email_verified, name, email, phone')

    if (normalizedPhone && email) {
      query = query.or(`phone.eq.${normalizedPhone},email.eq.${email}`)
    } else if (normalizedPhone) {
      query = query.eq('phone', normalizedPhone)
    } else if (email) {
      query = query.eq('email', email)
    }

    const { data: user } = await query.maybeSingle()

    if (user && (user.phone_verified || user.email_verified)) {
      return res.json({
        success: true,
        verified: true,
        user_id: user.id,
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone
        }
      })
    }

    return res.json({
      success: true,
      verified: false,
      requires_verification: true
    })
  } catch (error) {
    console.error('Check user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Send OTP
api.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { phone } = body

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' })
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified, name, email')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existingUser && existingUser.phone_verified) {
      return res.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Phone number already verified'
      })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID

    if (!accountSid || !authToken || !verifyServiceSid) {
      return res.status(500).json({ error: 'Twilio credentials are not configured' })
    }

    const client = twilio(accountSid, authToken)

    try {
      await client.verify.v2
        .services(verifyServiceSid)
        .verifications.create({ to: normalizedPhone, channel: 'sms' })
    } catch (twilioError: any) {
      console.error('Twilio error:', twilioError)

      if (twilioError.code === 60223) {
        return res.status(500).json({
          error: 'SMS delivery is not enabled in your Twilio Verify service. Please enable SMS in Twilio Console.',
          details: 'Go to Twilio Console ? Verify ? Services ? Your Service ? Settings ? Enable SMS channel'
        })
      }

      return res.status(500).json({ error: twilioError.message || 'Failed to send OTP' })
    }

    return res.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: 'Please verify your phone number with OTP'
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Verify OTP
api.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { code, name, email, phone } = body

    if (!code) {
      return res.status(400).json({ error: 'OTP code is required' })
    }

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required' })
    }

    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID

    if (!accountSid || !authToken || !verifyServiceSid) {
      return res.status(500).json({ error: 'Twilio credentials are not configured' })
    }

    const client = twilio(accountSid, authToken)

    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: normalizedPhone, code })

    if (verification.status !== 'approved') {
      return res.status(401).json({ error: 'Invalid or expired OTP' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, phone_verified')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let userId

    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          phone_verified: true,
          otp_verified_at: new Date().toISOString(),
          name,
          email
        })
        .eq('id', existingUser.id)
        .select('id')
        .single()

      if (updateError) {
        console.error('User update error:', updateError)
        return res.status(500).json({ error: 'Failed to update user' })
      }

      userId = updatedUser.id
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          name,
          email,
          phone: normalizedPhone,
          phone_verified: true,
          otp_verified_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (createError) {
        console.error('User creation error:', createError)
        return res.status(500).json({ error: 'Failed to create user', details: createError.message })
      }

      userId = newUser.id
    }

    return res.json({
      success: true,
      user_id: userId,
      phone_verified: true,
      message: 'Phone number verified successfully'
    })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Send Email OTP
api.post('/auth/send-email-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { email, name } = body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified, name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser && existingUser.email_verified) {
      return res.json({
        success: true,
        verified: true,
        user_id: existingUser.id,
        message: 'Email already verified. You can proceed to register for auctions.'
      })
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentOtps } = await supabaseAdmin
      .from('email_otps')
      .select('id')
      .eq('email', normalizedEmail)
      .gte('created_at', oneHourAgo)

    if (recentOtps && recentOtps.length >= 3) {
      return res.status(429).json({ error: 'Too many OTP requests. Please try again after 1 hour.' })
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'

    const { error: insertError } = await supabaseAdmin
      .from('email_otps')
      .insert({
        email: normalizedEmail,
        otp_code: otpCode,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent
      })

    if (insertError) {
      console.error('Failed to store OTP:', insertError)
      return res.status(500).json({ error: 'Failed to generate OTP' })
    }

    try {
      const emailResult = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: normalizedEmail,
        subject: 'Your Verification Code - Indu Heritage Auctions',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .container {
                  background: linear-gradient(135deg, #fff8ee, #f4e1c6);
                  border: 2px solid #8B4513;
                  border-radius: 12px;
                  padding: 40px;
                  text-align: center;
                }
                .logo {
                  font-size: 24px;
                  font-weight: 700;
                  color: #8B4513;
                  margin-bottom: 20px;
                }
                .otp-code {
                  font-size: 48px;
                  font-weight: 700;
                  color: #FF6B35;
                  letter-spacing: 8px;
                  margin: 30px 0;
                  padding: 20px;
                  background: white;
                  border-radius: 8px;
                  border: 2px solid #000;
                }
                .message {
                  color: #2a1a12;
                  margin: 20px 0;
                }
                .expiry {
                  color: #666;
                  font-size: 14px;
                  margin-top: 20px;
                }
                .footer {
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #ddd;
                  color: #999;
                  font-size: 12px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo">??? Indu Heritage Auctions</div>
                <h1 style="color: #2a1a12; margin-bottom: 10px;">Verify Your Email</h1>
                <p class="message">
                  ${name ? `Hello ${name},<br><br>` : ''}
                  Enter this verification code to complete your registration:
                </p>
                <div class="otp-code">${otpCode}</div>
                <p class="expiry">? This code expires in 10 minutes</p>
                <p class="message" style="margin-top: 30px; font-size: 14px;">
                  If you didn't request this code, please ignore this email.
                </p>
                <div class="footer">
                  © ${new Date().getFullYear()} Indu Heritage Auctions. All rights reserved.
                </div>
              </div>
            </body>
          </html>
        `,
      })

      console.log('Resend API response:', emailResult)
      console.log('Email sent successfully to:', normalizedEmail)
      console.log('?? DEV MODE - OTP Code:', otpCode)
    } catch (resendError: any) {
      console.error('Resend error:', resendError)
      console.error('Resend error details:', JSON.stringify(resendError, null, 2))
      console.log('?? Email failed but OTP stored. DEV MODE - OTP Code:', otpCode)
    }

    return res.json({
      success: true,
      verified: false,
      requires_otp: true,
      user_exists: !!existingUser,
      message: `Verification code sent to ${normalizedEmail}. Please check your inbox.`,
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: otpCode })
    })
  } catch (error) {
    console.error('Send email OTP error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Verify Email OTP
api.post('/auth/verify-email-otp', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { code, name, email, phone } = body

    if (!code || !email) {
      return res.status(400).json({ error: 'Verification code and email are required' })
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('email_otps')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('otp_code', code)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpError || !otpRecord) {
      return res.status(401).json({ error: 'Invalid or expired verification code' })
    }

    const now = new Date()
    const expiresAt = new Date(otpRecord.expires_at)

    if (now > expiresAt) {
      return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' })
    }

    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ error: 'Too many verification attempts. Please request a new code.' })
    }

    await supabaseAdmin
      .from('email_otps')
      .update({ verified: true })
      .eq('id', otpRecord.id)

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .maybeSingle()

    let userId

    if (existingUser) {
      const updateData: any = {
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        name
      }

      if (phone) {
        updateData.phone = phone
      }

      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select('id')
        .single()

      if (updateError) {
        console.error('User update error:', updateError)
        return res.status(500).json({ error: 'Failed to update user' })
      }

      userId = updatedUser.id
    } else {
      const insertData: any = {
        name,
        email: normalizedEmail,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        phone_verified: false
      }

      if (phone) {
        insertData.phone = phone
      }

      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert(insertData)
        .select('id')
        .single()

      if (createError) {
        console.error('User creation error:', createError)
        return res.status(500).json({ error: 'Failed to create user', details: createError.message })
      }

      userId = newUser.id
    }

    return res.json({
      success: true,
      user_id: userId,
      email_verified: true,
      message: 'Email verified successfully! You can now register for auctions.'
    })
  } catch (error: any) {
    console.error('Verify email OTP error:', error)

    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: verify test otp (disabled)
api.post('/auth/verify-test-otp', async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'This test endpoint has been disabled',
    message: 'Please use the web UI at /test-otp for Clerk phone verification',
    web_ui_url: '/test-otp'
  })
})

// Public: Register bidder
api.post('/register-bidder', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { auction_id, name, phone, email } = body

    if (!auction_id || !name || !phone || !email) {
      return res.status(400).json({ error: 'All fields are required: auction_id, name, phone, email' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, registration_end_time')
      .eq('id', auction_id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const now = new Date()
    const registrationEnd = new Date(auction.registration_end_time)

    if (now > registrationEnd) {
      return res.status(400).json({ error: 'Registration period has ended' })
    }

    let userId = null
    let userVerified = false

    const normalizedEmail = email.toLowerCase().trim()

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser) {
      userId = existingUser.id
      userVerified = existingUser.email_verified || false

      if (!userVerified) {
        return res.status(403).json({
          error: 'Email not verified',
          requires_verification: true,
          message: 'Please verify your email address before registering for auctions'
        })
      }
    } else {
      return res.status(403).json({
        error: 'Email not verified',
        requires_verification: true,
        message: 'Please verify your email address before registering for auctions'
      })
    }

    let query = supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('auction_id', auction_id)

    if (userId) {
      query = query.or(`phone.eq.${phone},user_id.eq.${userId}`)
    } else {
      query = query.eq('phone', phone)
    }

    const { data: existingBidder } = await query.maybeSingle()

    if (existingBidder) {
      return res.status(409).json({ error: 'You are already registered for this auction' })
    }

    const bidderData: any = {
      auction_id,
      name,
      phone,
      email
    }

    if (userId) {
      bidderData.user_id = userId
    }

    const { data: newBidder, error: insertError } = await supabaseAdmin
      .from('bidders')
      .insert(bidderData)
      .select('id')
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return res.status(500).json({ error: 'Failed to register bidder', details: insertError.message })
    }

    return res.status(201).json({
      success: true,
      bidder_id: newBidder.id,
      message: 'Successfully registered for auction'
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Place bid
api.post('/place-bid', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { auction_id, bidder_id, amount, size } = body

    if (!auction_id || !bidder_id || !amount) {
      return res.status(400).json({ error: 'All fields are required: auction_id, bidder_id, amount' })
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }

    const { data, error } = await supabaseAdmin.rpc('place_bid', {
      p_auction_id: auction_id,
      p_bidder_id: bidder_id,
      p_amount: amount,
      p_size: size || null
    })

    if (error) {
      console.error('RPC Error:', error)
      return res.status(500).json({ error: 'Failed to place bid', details: error.message })
    }

    const result = data as any

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error })
    }

    return res.status(201).json({
      success: true,
      bid_id: result.bid_id,
      amount: result.amount,
      created_at: result.created_at,
      message: 'Bid placed successfully',
      extended: result.extended,
      new_end_time: result.new_end_time
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Shopify drops
api.get('/shopify-drops', async (_req: Request, res: Response) => {
  try {
    const { data: drops, error } = await supabaseAdmin
      .from('shopify_drops')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch shopify drops' })
    }

    return res.json({ drops: drops || [] })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Cron: send missed winner emails, then check payment deadline and escalate
api.post('/cron/check-winner-payments', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET
  const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const now = new Date().toISOString()
  try {
    // Send winner email for any pending winner that was never notified (e.g. lazy-finalized)
    const { data: toNotify } = await supabaseAdmin
      .from('winners')
      .select('id, auction_id, bidder_id, winning_amount, claim_token, size')
      .eq('payment_status', 'pending')
      .not('claim_token', 'is', null)
      .is('winner_email_sent_at', null)
    if (toNotify && toNotify.length > 0) {
      for (const w of toNotify) {
        const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
        const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single()
        if ((bidder as any)?.email && w.claim_token) {
          const sent = await sendWinnerEmail({
            to: (bidder as any).email,
            winnerName: (bidder as any)?.name || 'Winner',
            auctionTitle: (auction as any)?.title || 'Auction',
            winningAmount: Number(w.winning_amount),
            claimToken: w.claim_token,
            isEscalation: false
          })
          if (sent) await supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id)
        }
      }
    }

    const { data: overdue } = await supabaseAdmin
      .from('winners')
      .select('id, auction_id, bidder_id, size, winning_amount')
      .eq('payment_status', 'pending')
      .lt('payment_due_at', now)

    if (!overdue || overdue.length === 0) {
      return res.json({ ok: true, marked_forfeited: 0, escalated: 0 })
    }

    let marked = 0
    let escalated = 0
    for (const w of overdue) {
      const { error: upErr } = await supabaseAdmin
        .from('winners')
        .update({ payment_status: 'forfeited' })
        .eq('id', w.id)
      if (upErr) continue
      marked++

      let secondBidQuery = supabaseAdmin
        .from('bids')
        .select('bidder_id, amount')
        .eq('auction_id', w.auction_id)
        .neq('bidder_id', w.bidder_id)
        .order('amount', { ascending: false })
        .limit(1)
      if (w.size != null && w.size !== '') {
        secondBidQuery = secondBidQuery.eq('size', w.size)
      } else {
        secondBidQuery = secondBidQuery.is('size', null)
      }
      const { data: secondBid } = await secondBidQuery.maybeSingle()

      if (!secondBid?.bidder_id) continue

      const newDue = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      const { error: escErr } = await supabaseAdmin
        .from('winners')
        .update({
          bidder_id: secondBid.bidder_id,
          winning_amount: secondBid.amount,
          declared_at: now,
          payment_due_at: newDue,
          payment_status: 'pending',
          escalation_done: true,
          claim_token: crypto.randomUUID(),
          winner_email_sent_at: null
        })
        .eq('id', w.id)
      if (escErr) continue
      escalated++

      const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
      const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', secondBid.bidder_id).single()
      const winnerRow = await supabaseAdmin.from('winners').select('claim_token').eq('id', w.id).single()
      const claimToken = (winnerRow.data as any)?.claim_token
      if (bidder?.email && claimToken) {
        await sendWinnerEmail({
          to: (bidder as any).email,
          winnerName: (bidder as any)?.name || 'Winner',
          auctionTitle: (auction as any)?.title || 'Auction',
          winningAmount: Number(secondBid.amount),
          claimToken,
          isEscalation: true
        })
        await supabaseAdmin.from('winners').update({ winner_email_sent_at: now }).eq('id', w.id)
      }
    }

    return res.json({ ok: true, marked_forfeited: marked, escalated })
  } catch (e) {
    console.error('Cron check-winner-payments error:', e)
    return res.status(500).json({ error: 'Cron failed' })
  }
})

// Public: get winner claim by token (for payment form)
api.get('/winner/claim', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string)?.trim()
    if (!token) {
      return res.status(400).json({ error: 'Token required' })
    }
    const { data: winner, error } = await supabaseAdmin
      .from('winners')
      .select(`
        id, auction_id, winning_amount, payment_due_at, payment_status, size,
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
        size: w.size
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
      razorpay_key_id: razorpay ? razorpayKeyId : undefined
    })
  } catch (e) {
    console.error('Winner claim get error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: create Razorpay order for winner (by claim token)
api.post('/winner/create-order', async (req: Request, res: Response) => {
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
      const order = await new Promise<any>((resolve, reject) => {
        razorpay.orders.create(
          { amount: amountPaise, currency: 'INR', receipt },
          (err: any, order: any) => (err ? reject(err) : resolve(order))
        )
      })
      orderId = order.id
      await supabaseAdmin.from('winners').update({ razorpay_order_id: orderId }).eq('id', w.id)
    }
    return res.json({
      key_id: razorpayKeyId,
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
api.post('/winner/verify-payment', async (req: Request, res: Response) => {
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
      .select('id, payment_status, razorpay_order_id')
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
      const payment = await new Promise<any>((resolve, reject) => {
        ;(razorpay.payments as any).fetch(razorpay_payment_id, (err: any, p: any) => (err ? reject(err) : resolve(p)))
      })
      if (!payment || payment.status !== 'captured') {
        return res.status(400).json({ error: 'Payment not captured. Please try again or contact support.' })
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
    const result = await markWinnerPaidRazorpay(w.id, razorpay_payment_id)
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to update' })
    }
    return res.json({ success: true, message: 'Payment confirmed. You will receive a confirmation email shortly.' })
  } catch (e: any) {
    console.error('Winner verify-payment error:', e)
    return res.status(500).json({ error: e?.message || 'Internal server error' })
  }
})

// Razorpay webhook: payment.captured → mark winner paid (source of truth; idempotent)
api.post('/winner/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody as Buffer | undefined
    if (!rawBody || !rawBody.length) {
      return res.status(400).send('Missing body')
    }
    const signature = req.headers['x-razorpay-signature'] as string
    if (!razorpayWebhookSecret || !signature) {
      return res.status(400).send('Missing signature or webhook secret')
    }
    const expectedSig = crypto.createHmac('sha256', razorpayWebhookSecret).update(rawBody).digest('hex')
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
      await markWinnerPaidRazorpay(winner.id, payment.id)
    }
    return res.status(200).send('OK')
  } catch (e) {
    console.error('Winner webhook error:', e)
    return res.status(500).send('Error')
  }
})

// Admin routes
const admin = express.Router()
admin.use(requireAdmin)

admin.get('/auctions', async (_req: Request, res: Response) => {
  try {
    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    return res.json({ auctions })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.post('/auctions', maybeUpload, async (req: Request, res: Response) => {
  try {
    const contentType = req.headers['content-type'] || ''
    const ALLOWED_REEL_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
    const MAX_REEL_MB = 50
    const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media'

    let body: Record<string, any> = {}
    let reelFile: Express.Multer.File | null = null
    let galleryUrls: string[] = []

    if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
      const getString = (key: string) => {
        const value = (req.body as any)?.[key]
        return typeof value === 'string' ? value : ''
      }

      body = {
        title: getString('title'),
        product_id: getString('product_id'),
        min_increment: getString('min_increment'),
        base_price: getString('base_price'),
        banner_image: getString('banner_image'),
        registration_end_time: getString('registration_end_time'),
        bidding_start_time: getString('bidding_start_time'),
        bidding_end_time: getString('bidding_end_time'),
        status: getString('status'),
        reel_url: getString('reel_url'),
        available_sizes: getString('available_sizes')
      }

      const files = (req.files || []) as Express.Multer.File[]
      reelFile = files.find((file) => file.fieldname === 'reel') || null
      const galleryFiles = files.filter((file) => file.fieldname === 'gallery')

      if (galleryFiles && galleryFiles.length > 0) {
        for (const file of galleryFiles) {
          if (!file.mimetype.startsWith('image/')) continue
          if (file.size > 5 * 1024 * 1024) continue

          const ext = file.originalname.split('.').pop() || 'jpg'
          const path = `gallery/${crypto.randomUUID()}.${ext}`

          const { error: uploadError } = await supabaseAdmin
            .storage
            .from(bucket)
            .upload(path, file.buffer, {
              contentType: file.mimetype,
              upsert: false
            })

          if (!uploadError) {
            const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
            galleryUrls.push(publicData.publicUrl)
          }
        }
      }

      const passedGalleryUrls = (req.body as any)?.gallery_urls
      if (passedGalleryUrls) {
        if (Array.isArray(passedGalleryUrls)) {
          passedGalleryUrls.forEach((url) => {
            if (typeof url === 'string' && url.trim() !== '') {
              galleryUrls.push(url)
            }
          })
        } else if (typeof passedGalleryUrls === 'string' && passedGalleryUrls.trim() !== '') {
          galleryUrls.push(passedGalleryUrls)
        }
      }
    } else {
      body = (req.body || {}) as Record<string, any>
      const passedGalleryUrls = (body as any).gallery_urls
      if (passedGalleryUrls) {
        if (Array.isArray(passedGalleryUrls)) {
          galleryUrls.push(...passedGalleryUrls)
        } else if (typeof passedGalleryUrls === 'string') {
          galleryUrls.push(passedGalleryUrls)
        }
      }
    }

    const {
      title,
      product_id,
      min_increment,
      base_price,
      banner_image,
      registration_end_time,
      bidding_start_time,
      bidding_end_time,
      status,
      reel_url,
      available_sizes
    } = body

    const availableSizesArray = available_sizes
      ? String(available_sizes).split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : []

    if (!title || !product_id || !min_increment || !registration_end_time || !bidding_start_time || !bidding_end_time || !status) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    const validStatuses = ['draft', 'live', 'ended']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be draft, live, or ended' })
    }

    const minIncrementValue = typeof min_increment === 'number'
      ? min_increment
      : parseFloat(min_increment)

    if (!Number.isFinite(minIncrementValue) || minIncrementValue <= 0) {
      return res.status(400).json({ error: 'Minimum increment must be a positive number' })
    }

    let basePriceValue: number | null = null
    if (base_price && base_price !== '') {
      basePriceValue = typeof base_price === 'number' ? base_price : parseFloat(base_price)

      if (!Number.isFinite(basePriceValue) || basePriceValue <= 0) {
        return res.status(400).json({ error: 'Base price must be a positive number' })
      }
    }

    const toIST = (dateStr: string) => {
      try {
        if (dateStr.includes('Z') || dateStr.includes('+')) return new Date(dateStr)
        return new Date(`${dateStr}+05:30`)
      } catch (e) {
        return new Date('Invalid')
      }
    }

    let registrationEndUTC, biddingStartUTC, biddingEndUTC
    try {
      const regEnd = toIST(registration_end_time)
      const bidStart = toIST(bidding_start_time)
      const bidEnd = toIST(bidding_end_time)

      if (Number.isNaN(regEnd.getTime()) || Number.isNaN(bidStart.getTime()) || Number.isNaN(bidEnd.getTime())) {
        throw new Error('Invalid date format provided')
      }

      registrationEndUTC = regEnd.toISOString()
      biddingStartUTC = bidStart.toISOString()
      biddingEndUTC = bidEnd.toISOString()

      if (regEnd >= bidStart) {
        return res.status(400).json({ error: 'Registration must end before bidding starts' })
      }

      if (bidStart >= bidEnd) {
        return res.status(400).json({ error: 'Bidding start time must be before end time' })
      }
    } catch (e: any) {
      return res.status(400).json({ error: e.message || 'Invalid date format' })
    }

    let reelPublicUrl: string | null = reel_url || null

    if (reelFile) {
      if (!ALLOWED_REEL_TYPES.includes(reelFile.mimetype)) {
        return res.status(400).json({ error: 'Reel must be MP4, WebM, or MOV' })
      }

      const maxBytes = MAX_REEL_MB * 1024 * 1024
      if (reelFile.size > maxBytes) {
        return res.status(400).json({ error: `Reel must be under ${MAX_REEL_MB}MB` })
      }

      const extension = reelFile.originalname.split('.').pop() || 'mp4'
      const reelPath = `reels/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabaseAdmin
        .storage
        .from(bucket)
        .upload(reelPath, reelFile.buffer, {
          contentType: reelFile.mimetype,
          upsert: false
        })

      if (uploadError) {
        return res.status(500).json({ error: 'Failed to upload reel', details: uploadError.message })
      }

      const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(reelPath)
      reelPublicUrl = publicData.publicUrl
    }

    const { data, error } = await supabaseAdmin
      .from('auctions')
      .insert({
        title,
        product_id,
        min_increment: minIncrementValue,
        base_price: basePriceValue,
        banner_image: banner_image || null,
        reel_url: reelPublicUrl,
        gallery_images: galleryUrls.length > 0 ? galleryUrls : [],
        registration_end_time: registrationEndUTC,
        bidding_start_time: biddingStartUTC,
        bidding_end_time: biddingEndUTC,
        status,
        available_sizes: availableSizesArray
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to create auction', details: error.message })
    }

    return res.status(201).json({ success: true, auction: data })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

admin.get('/auctions/:id', async (req: Request, res: Response) => {
  try {
    const auctionId = req.params.id

    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const { data: bidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select('*')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })

    if (biddersError) {
      console.error('Error fetching bidders:', biddersError)
    }

    const { data: bids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select(`
        id,
        amount,
        created_at,
        bidder_id,
        auction_id,
        size,
        bidders!fk_bids_bidder (
          id,
          name,
          phone,
          email
        )
      `)
      .eq('auction_id', auctionId)
      .order('amount', { ascending: false })

    if (bidsError) {
      console.error('Error fetching bids:', bidsError)
      const { data: simpleBids } = await supabaseAdmin
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .order('amount', { ascending: false })

      const bidsWithBidderInfo = simpleBids?.map(bid => {
        const bidder = bidders?.find(b => b.id === bid.bidder_id)
        return {
          ...bid,
          bidders: bidder ? {
            id: bidder.id,
            name: bidder.name,
            phone: bidder.phone,
            email: bidder.email
          } : null
        }
      }) || []

      const currentHighestBid = simpleBids && simpleBids.length > 0
        ? Math.max(...simpleBids.map(b => b.amount))
        : null

      const biddersWithHighestBid = bidders?.map(bidder => {
        const bidderBids = simpleBids?.filter(bid => bid.bidder_id === bidder.id) || []
        const highestBid = bidderBids.length > 0
          ? Math.max(...bidderBids.map(b => b.amount))
          : null

        return {
          ...bidder,
          highest_bid: highestBid
        }
      }) || []

      const { data: winnersRowsFallback } = await supabaseAdmin
        .from('winners')
        .select('id, auction_id, bidder_id, winning_amount, size, declared_at, bidder:bidder_id(name, phone, email)')
        .eq('auction_id', auctionId)

      const winners_by_size_fallback = (winnersRowsFallback || []).map((w: any) => {
        const bidder = w.bidder
        const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null
        const phone = Array.isArray(bidder) ? bidder[0]?.phone : bidder?.phone ?? null
        const email = Array.isArray(bidder) ? bidder[0]?.email : bidder?.email ?? null
        return {
          size: w.size ?? null,
          bidder_id: w.bidder_id,
          winning_amount: w.winning_amount,
          declared_at: w.declared_at,
          winner_name: name,
          winner_phone: phone,
          winner_email: email
        }
      })

      return res.json({
        auction,
        bidders: biddersWithHighestBid,
        bids: bidsWithBidderInfo,
        current_highest_bid: currentHighestBid,
        winners_by_size: winners_by_size_fallback
      })
    }

    const currentHighestBid = bids && bids.length > 0
      ? Math.max(...(bids as any[]).map((b: any) => b.amount))
      : null

    const biddersWithHighestBid = bidders?.map(bidder => {
      const bidderBids = (bids as any[])?.filter(bid => bid.bidder_id === bidder.id) || []
      const highestBid = bidderBids.length > 0
        ? Math.max(...bidderBids.map(b => b.amount))
        : null

      return {
        ...bidder,
        highest_bid: highestBid
      }
    }) || []

    const { data: winnersRows } = await supabaseAdmin
      .from('winners')
      .select('id, auction_id, bidder_id, winning_amount, size, declared_at, bidder:bidder_id(name, phone, email)')
      .eq('auction_id', auctionId)

    const winners_by_size = (winnersRows || []).map((w: any) => {
      const bidder = w.bidder
      const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null
      const phone = Array.isArray(bidder) ? bidder[0]?.phone : bidder?.phone ?? null
      const email = Array.isArray(bidder) ? bidder[0]?.email : bidder?.email ?? null
      return {
        size: w.size ?? null,
        bidder_id: w.bidder_id,
        winning_amount: w.winning_amount,
        declared_at: w.declared_at,
        winner_name: name,
        winner_phone: phone,
        winner_email: email
      }
    })

    return res.json({
      auction,
      bidders: biddersWithHighestBid,
      bids: bids || [],
      current_highest_bid: currentHighestBid,
      winners_by_size
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.put('/auctions/:id', async (req: Request, res: Response) => {
  try {
    const auctionId = req.params.id
    const body = req.body || {}

    const {
      title,
      product_id,
      min_increment,
      registration_end_time,
      bidding_start_time,
      bidding_end_time,
      status
    } = body

    const { data: existingAuction, error: checkError } = await supabaseAdmin
      .from('auctions')
      .select('id, status')
      .eq('id', auctionId)
      .single()

    if (checkError || !existingAuction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const updateData: any = {}
    if (title) updateData.title = title
    if (product_id) updateData.product_id = product_id
    if (min_increment) updateData.min_increment = parseFloat(min_increment)
    if (registration_end_time) updateData.registration_end_time = new Date(registration_end_time).toISOString()
    if (bidding_start_time) updateData.bidding_start_time = new Date(bidding_start_time).toISOString()
    if (bidding_end_time) updateData.bidding_end_time = new Date(bidding_end_time).toISOString()
    if (status) updateData.status = status

    const { data: updatedAuction, error: updateError } = await supabaseAdmin
      .from('auctions')
      .update(updateData)
      .eq('id', auctionId)
      .select()
      .single()

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update auction', details: updateError.message })
    }

    if (status === 'ended') {
      const sizes: string[] = Array.isArray(updatedAuction?.available_sizes) ? updatedAuction.available_sizes : []
      const nowIso = new Date().toISOString()

      if (sizes.length > 0) {
        for (const size of sizes) {
          const { data: highestBid, error: highestBidError } = await supabaseAdmin
            .from('bids')
            .select('amount, bidder_id')
            .eq('auction_id', auctionId)
            .eq('size', size)
            .order('amount', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (highestBidError) {
            console.error('Failed to calculate winner for size', size, highestBidError)
            continue
          }

          const winningAmount = Number(highestBid?.amount ?? 0)
          if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auctionId,
                  bidder_id: highestBid.bidder_id,
                  winning_amount: winningAmount,
                  declared_at: nowIso,
                  size
                },
                { onConflict: 'auction_id,size' }
              )

            if (winnerError) {
              console.error('Failed to save winner for size', size, winnerError)
            }
          }
        }
      } else {
        const { data: highestBid, error: highestBidError } = await supabaseAdmin
          .from('bids')
          .select('amount, bidder_id')
          .eq('auction_id', auctionId)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (highestBidError) {
          console.error('Failed to calculate winner:', highestBidError)
          return res.status(500).json({ error: 'Failed to calculate winner', details: highestBidError.message })
        }

        const winningAmount = Number(highestBid?.amount ?? 0)
        if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
          const { error: winnerError } = await supabaseAdmin
            .from('winners')
            .upsert(
              {
                auction_id: auctionId,
                bidder_id: highestBid.bidder_id,
                winning_amount: winningAmount,
                declared_at: nowIso,
                size: null
              },
              { onConflict: 'auction_id,size' }
            )

          if (winnerError) {
            console.error('Failed to save winner:', winnerError)
            return res.status(500).json({ error: 'Failed to save winner', details: winnerError.message })
          }
        }
      }
    }

    return res.json({ success: true, auction: updatedAuction })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.delete('/auctions/:id', async (req: Request, res: Response) => {
  try {
    const auctionId = req.params.id

    const { error: deleteError } = await supabaseAdmin
      .from('auctions')
      .delete()
      .eq('id', auctionId)

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete auction', details: deleteError.message })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.get('/bidders', async (_req: Request, res: Response) => {
  try {
    const { data: bidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select(`
        id,
        name,
        phone,
        email,
        auction_id,
        created_at,
        auction:auctions(title, product_id, status)
      `)
      .order('created_at', { ascending: false })

    if (biddersError) throw biddersError

    const biddersWithStats = await Promise.all(
      (bidders || []).map(async (bidder: any) => {
        const { count: bidsCount } = await supabaseAdmin
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('bidder_id', bidder.id)

        const { data: highestBidData } = await supabaseAdmin
          .from('bids')
          .select('amount')
          .eq('bidder_id', bidder.id)
          .order('amount', { ascending: false })
          .limit(1)
          .single()

        return {
          ...bidder,
          registered_at: bidder.created_at,
          bids_count: bidsCount || 0,
          highest_bid: highestBidData?.amount || null
        }
      })
    )

    return res.json({
      success: true,
      bidders: biddersWithStats
    })
  } catch (error: any) {
    console.error('Bidders API error:', error)
    return res.status(500).json({
      error: 'Failed to fetch bidders',
      message: error.message
    })
  }
})

admin.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const { data: auctions, error: auctionsError } = await supabaseAdmin
      .from('auctions')
      .select('status')

    if (auctionsError) throw auctionsError

    const totalAuctions = auctions?.length || 0
    const liveAuctions = auctions?.filter((a: any) => a.status === 'live').length || 0
    const draftAuctions = auctions?.filter((a: any) => a.status === 'draft').length || 0
    const endedAuctions = auctions?.filter((a: any) => a.status === 'ended').length || 0

    const { count: totalBidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select('id', { count: 'exact', head: true })

    if (biddersError) throw biddersError

    const { count: totalBids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select('id', { count: 'exact', head: true })

    if (bidsError) throw bidsError

    const { count: recentWinners, error: winnersError } = await supabaseAdmin
      .from('winners')
      .select('id', { count: 'exact', head: true })

    if (winnersError) throw winnersError

    return res.json({
      success: true,
      stats: {
        totalAuctions,
        liveAuctions,
        draftAuctions,
        endedAuctions,
        totalBidders: totalBidders || 0,
        totalBids: totalBids || 0,
        recentWinners: recentWinners || 0
      }
    })
  } catch (error: any) {
    console.error('Dashboard API error:', error)
    return res.status(500).json({
      error: 'Failed to fetch dashboard stats',
      message: error.message
    })
  }
})

admin.get('/shopify-drops', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true'

    let query = supabaseAdmin
      .from('shopify_drops')
      .select('*')
      .order('display_order', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: drops, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch shopify drops' })
    }

    return res.json({ drops: drops || [] })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.post('/shopify-drops', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { title, description, price, link_url, image_url, tone, display_order, is_active } = body

    if (!title || !description || !price || !link_url) {
      return res.status(400).json({ error: 'Missing required fields: title, description, price, link_url' })
    }

    const { data, error } = await supabaseAdmin
      .from('shopify_drops')
      .insert({
        title,
        description,
        price,
        link_url,
        image_url: image_url || null,
        tone: tone || 'ochre',
        display_order: display_order || 0,
        is_active: is_active !== undefined ? is_active : true
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to create shopify drop' })
    }

    return res.json({ drop: data, message: 'Shopify drop created successfully' })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.patch('/shopify-drops', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { id, ...updates } = body

    if (!id) {
      return res.status(400).json({ error: 'Missing drop ID' })
    }

    const { data, error } = await supabaseAdmin
      .from('shopify_drops')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to update shopify drop' })
    }

    return res.json({ drop: data, message: 'Shopify drop updated successfully' })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.delete('/shopify-drops', async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string | undefined

    if (!id) {
      return res.status(400).json({ error: 'Missing drop ID' })
    }

    const { error } = await supabaseAdmin
      .from('shopify_drops')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to delete shopify drop' })
    }

    return res.json({ message: 'Shopify drop deleted successfully' })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.post('/upload-url', async (req: Request, res: Response) => {
  try {
    const { filename, type, folder } = req.body || {}

    if (!filename || !type) {
      return res.status(400).json({ error: 'Filename and type required' })
    }

    const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media'
    const extension = filename.split('.').pop() || 'bin'
    const timestamp = Date.now()
    const cleanFolder = folder ? String(folder).replace(/[^a-z0-9]/gi, '') : 'uploads'
    const path = `${cleanFolder}/${timestamp}-${crypto.randomUUID()}.${extension}`

    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUploadUrl(path)

    if (error) {
      console.error('Signed URL creation failed:', error)
      return res.status(500).json({ error: error.message })
    }

    const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)

    return res.json({
      signedUrl: data.signedUrl,
      path: data.path,
      publicUrl: publicData.publicUrl
    })
  } catch (error) {
    console.error('Upload URL error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

admin.get('/winners', async (_req: Request, res: Response) => {
  try {
    const { data: winners, error } = await supabaseAdmin
      .from('winners')
      .select(`
        id,
        auction_id,
        bidder_id,
        winning_amount,
        size,
        created_at,
        payment_due_at,
        payment_status,
        payment_completed_at,
        payment_proof_note,
        payment_proof_url,
        payment_verified_by_admin,
        razorpay_order_id,
        razorpay_payment_id,
        instagram_handle,
        dispatched_at,
        escalation_done,
        bidder:bidders(name, phone, email),
        auction:auctions(title, product_id)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return res.json({
      success: true,
      winners: winners || []
    })
  } catch (error: any) {
    console.error('Winners API error:', error)
    return res.status(500).json({
      error: 'Failed to fetch winners',
      message: error.message
    })
  }
})

admin.patch('/winners/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const body = req.body || {}
    const { payment_status, dispatched_at } = body
    const updates: Record<string, any> = {}
    if (payment_status === 'completed') {
      updates.payment_status = 'completed'
      updates.payment_completed_at = new Date().toISOString()
      updates.payment_verified_by_admin = true
    }
    if (dispatched_at !== undefined) {
      updates.dispatched_at = dispatched_at === true || dispatched_at === 'true' ? new Date().toISOString() : dispatched_at || null
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide payment_status and/or dispatched_at' })
    }
    const { data, error } = await supabaseAdmin
      .from('winners')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    if (payment_status === 'completed' && data?.bidder_id) {
      const { data: bidder } = await supabaseAdmin.from('bidders').select('email, name').eq('id', data.bidder_id).single()
      const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', data.auction_id).single()
      if ((bidder as any)?.email) {
        await sendPaymentConfirmedEmail(
          (bidder as any).email,
          (bidder as any)?.name || 'Winner',
          (auction as any)?.title || 'Auction'
        )
      }
    }

    return res.json({ success: true, winner: data })
  } catch (error: any) {
    console.error('Patch winner error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to update winner' })
  }
})

api.use('/admin', admin)

app.use('/api', api)

// 404: always return JSON so frontend never gets HTML
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler: always return JSON so frontend never gets "Internal Server Error" as plain text
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Backend error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err?.message || undefined
  })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
})



