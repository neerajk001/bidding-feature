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

// Place bid (pure application logic - no RPC)
router.post('/place-bid', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const { auction_id, bidder_id, amount, size } = body

    if (!auction_id || !bidder_id || !amount) {
      return res.status(400).json({ error: 'All fields are required: auction_id, bidder_id, amount' })
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }

    // 1. Get auction details
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, status, bidding_start_time, bidding_end_time, min_increment, base_price')
      .eq('id', auction_id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    // Ensure bidder belongs to this auction to prevent cross-auction or crafted requests.
    const { data: bidder, error: bidderError } = await supabaseAdmin
      .from('bidders')
      .select('id')
      .eq('id', bidder_id)
      .eq('auction_id', auction_id)
      .maybeSingle()

    if (bidderError || !bidder) {
      return res.status(400).json({ error: 'Bidder is not registered for this auction' })
    }

    // 2. Validate auction status and timing
    if (auction.status !== 'live') {
      return res.status(400).json({ error: 'Auction is not live' })
    }

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

    // 3. Get current highest bid for this size (or global if no size)
    const normalizedSize = size ? String(size).trim() : null
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

    const { data: highestBids } = await highestBidQuery
    const currentHighestBid = highestBids && highestBids.length > 0 ? Number(highestBids[0].amount) : 0

    // 4. Validate bid amount
    const minIncrement = Number(auction.min_increment || 0)
    const basePrice = Number(auction.base_price || 0)

    if (currentHighestBid === 0) {
      // First bid
      const minRequired = basePrice || minIncrement
      if (amount < minRequired) {
        return res.status(400).json({ 
          error: `First bid must be at least ${minRequired}`,
          min_required: minRequired 
        })
      }
    } else {
      // Subsequent bids
      const minRequired = currentHighestBid + minIncrement
      if (amount < minRequired) {
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
        amount,
        size: normalizedSize
      })
      .select('id, created_at')
      .single()

    if (bidError) {
      console.error('Bid insert error:', bidError)
      return res.status(500).json({ error: 'Failed to place bid', details: bidError.message })
    }

    // 6. Anti-sniping: extend auction if bid placed within last 5 minutes
    const timeRemaining = endTs - nowTs
    const fiveMinutes = 5 * 60 * 1000
    let extended = false
    let newEndTime = null

    if (timeRemaining < fiveMinutes) {
      newEndTime = new Date(nowTs + fiveMinutes).toISOString()
      
      const { error: updateError } = await supabaseAdmin
        .from('auctions')
        .update({ bidding_end_time: newEndTime })
        .eq('id', auction_id)

      if (!updateError) {
        extended = true
      }
    }

    return res.status(201).json({
      success: true,
      bid_id: newBid.id,
      amount,
      created_at: newBid.created_at,
      message: 'Bid placed successfully',
      extended,
      new_end_time: newEndTime
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
