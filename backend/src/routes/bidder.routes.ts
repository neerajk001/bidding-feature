import express, { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'

const router = express.Router()

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NaN : ts
}

// Register bidder
router.post('/register-bidder', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { auction_id, name, phone, email, user_id } = body

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

    const normalizedEmail = email.toLowerCase().trim()
    const normalizedUserId = typeof user_id === 'string' ? user_id.trim() : ''
    let userId: string | null = null

    // Extra verification guard: if caller sends user_id from verification flow,
    // enforce that email belongs to the same verified user.
    if (normalizedUserId) {
      const { data: matchedUser } = await supabaseAdmin
        .from('users')
        .select('id, email, email_verified')
        .eq('id', normalizedUserId)
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!matchedUser || !matchedUser.email_verified) {
        return res.status(403).json({
          error: 'Email verification mismatch',
          requires_verification: true,
          message: 'Please verify your email again before registering.'
        })
      }

      userId = matchedUser.id
    } else {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, email_verified')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (!existingUser || !existingUser.email_verified) {
        return res.status(403).json({
          error: 'Email not verified',
          requires_verification: true,
          message: 'Please verify your email address before registering for auctions'
        })
      }

      userId = existingUser.id
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

// Place bid (pure application logic - no RPC)
router.post('/place-bid', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { auction_id, bidder_id, amount, size } = body

    if (!auction_id || !bidder_id || !amount) {
      return res.status(400).json({ error: 'All fields are required: auction_id, bidder_id, amount' })
    }

    const bidAmount = Number(amount)
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }

    // 1. Validate auction and bidder in parallel
    const [{ data: auction, error: auctionError }, { data: bidder, error: bidderError }] = await Promise.all([
      supabaseAdmin
        .from('auctions')
        .select('id, bidding_start_time, bidding_end_time, min_increment, base_price, available_sizes')
        .eq('id', auction_id)
        .single(),
      supabaseAdmin
        .from('bidders')
        .select('id')
        .eq('id', bidder_id)
        .eq('auction_id', auction_id)
        .maybeSingle()
    ])

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    if (bidderError || !bidder) {
      return res.status(400).json({ error: 'Bidder is not registered for this auction' })
    }

    // 2. Validate timing window (server-side authority)
    const nowTs = Date.now()
    const startTs = parseTimestamp(auction.bidding_start_time)
    const endTs = parseTimestamp(auction.bidding_end_time)

    if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
      return res.status(400).json({ error: 'Auction timing is invalid. Contact admin.' })
    }

    if (nowTs < startTs) {
      return res.status(400).json({ error: 'Bidding has not started yet' })
    }

    if (nowTs > endTs) {
      return res.status(400).json({ error: 'Bidding has ended' })
    }

    const normalizedSize = size ? String(size).trim() : null
    const configuredSizes = Array.isArray(auction.available_sizes)
      ? auction.available_sizes.map((s: any) => String(s ?? '').trim()).filter((s: string) => s.length > 0)
      : []

    if (configuredSizes.length > 0) {
      if (!normalizedSize) {
        return res.status(400).json({ error: 'Size is required for this auction.' })
      }

      if (!configuredSizes.includes(normalizedSize)) {
        return res.status(400).json({
          error: 'Selected size is not available for this auction.',
          allowed_sizes: configuredSizes
        })
      }

      const { data: firstBidForBidder } = await supabaseAdmin
        .from('bids')
        .select('size')
        .eq('auction_id', auction_id)
        .eq('bidder_id', bidder_id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

      const lockedBidSize = String((firstBidForBidder as any)?.size ?? '').trim() || null

      if (lockedBidSize && normalizedSize !== lockedBidSize) {
        return res.status(400).json({
          error: `Your size is locked to ${lockedBidSize} for this auction.`,
          locked_size: lockedBidSize
        })
      }
    } else if (normalizedSize) {
      return res.status(400).json({ error: 'Size is not applicable for this auction.' })
    }

    // 3. Get current highest bid for this size (or global if no size)
    let highestBidQuery = supabaseAdmin
      .from('bids')
      .select('amount')
      .eq('auction_id', auction_id)
      .order('amount', { ascending: false })
      .limit(1)

    if (normalizedSize) {
      highestBidQuery = highestBidQuery.eq('size', normalizedSize)
    } else {
      highestBidQuery = highestBidQuery.or('size.is.null,size.eq.')
    }

    const { data: highestBidRow } = await highestBidQuery.maybeSingle()
    const currentHighestBid = Number((highestBidRow as any)?.amount ?? 0)

    // 4. Validate bid amount
    const minIncrement = Number(auction.min_increment || 0)
    const basePrice = Number(auction.base_price || 0)

    if (currentHighestBid === 0) {
      // First bid
      const minRequired = basePrice || minIncrement
      if (bidAmount < minRequired) {
        return res.status(400).json({ 
          error: `First bid must be at least ${minRequired}`,
          min_required: minRequired 
        })
      }
    } else {
      // Subsequent bids
      const minRequired = currentHighestBid + minIncrement
      if (bidAmount < minRequired) {
        return res.status(400).json({ 
          error: `Bid must be at least ${minRequired}`,
          min_required: minRequired,
          current_highest: currentHighestBid
        })
      }
    }

    // 5. Insert bid
    const { data: newBid, error: bidError } = await supabaseAdmin
      .from('bids')
      .insert({
        auction_id,
        bidder_id,
        amount: bidAmount,
        size: normalizedSize
      })
      .select('id, amount, size, created_at')
      .single()

    if (bidError) {
      console.error('Bid insert error:', bidError)
      return res.status(500).json({ error: 'Failed to place bid', details: bidError.message })
    }

    return res.status(201).json({
      success: true,
      bid_id: newBid.id,
      amount: Number((newBid as any).amount ?? bidAmount),
      size: (newBid as any).size ?? normalizedSize,
      created_at: newBid.created_at
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Get bidder-specific size lock for an auction
router.get('/bidder-size-lock', async (req: Request, res: Response) => {
  try {
    const auction_id = String(req.query.auction_id ?? '').trim()
    const bidder_id = String(req.query.bidder_id ?? '').trim()

    if (!auction_id || !bidder_id) {
      return res.status(400).json({ error: 'auction_id and bidder_id are required' })
    }

    const { data: bidder, error: bidderError } = await supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('id', bidder_id)
      .eq('auction_id', auction_id)
      .maybeSingle()

    if (bidderError || !bidder) {
      return res.status(404).json({ error: 'Bidder not found for this auction' })
    }

    const { data: firstBid, error: firstBidError } = await supabaseAdmin
      .from('bids')
      .select('size')
      .eq('auction_id', auction_id)
      .eq('bidder_id', bidder_id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstBidError) {
      console.error('Failed to fetch bidder size lock:', firstBidError)
      return res.status(500).json({ error: 'Failed to fetch bidder size lock' })
    }

    const locked_size = String((firstBid as any)?.size ?? '').trim() || null

    return res.json({
      success: true,
      auction_id,
      bidder_id,
      locked_size,
      lock_active: Boolean(locked_size)
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
