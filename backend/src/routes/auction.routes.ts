import express, { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { finalizeEndedAuctions } from '../services/auction.service'
import { setNoCache } from '../middleware/cache'

const router = express.Router()

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NaN : ts
}

function isWithinWindow(nowTs: number, start: string | null | undefined, end: string | null | undefined): boolean {
  const startTs = parseTimestamp(start)
  const endTs = parseTimestamp(end)
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) return false
  return nowTs >= startTs && nowTs <= endTs
}

// Public: List auctions
router.get('/auctions', async (req: Request, res: Response) => {
  try {
    await finalizeEndedAuctions()

    const includeEnded = req.query.includeEnded === 'true'
    const statuses = includeEnded ? ['live', 'upcoming', 'ended'] : ['live', 'upcoming']

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment, base_price, available_sizes')
      .in('status', statuses)
      .order('bidding_start_time', { ascending: true })

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
router.get('/auction/active', async (_req: Request, res: Response) => {
  try {
    await finalizeEndedAuctions()

    const nowTs = Date.now()

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, status, registration_end_time, bidding_start_time, bidding_end_time')
      .in('status', ['live', 'upcoming'])
      .order('bidding_start_time', { ascending: true })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    if (!auctions || auctions.length === 0) {
      setNoCache(res)
      return res.json({ exists: false })
    }

    const liveAuction = auctions.find((auction: any) => isWithinWindow(nowTs, auction.bidding_start_time, auction.bidding_end_time))

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
      if (auction.status === 'ended') return false
      const startTs = parseTimestamp(auction.bidding_start_time)
      const regEndTs = parseTimestamp(auction.registration_end_time)
      if (Number.isNaN(startTs)) return false
      return nowTs < startTs && !Number.isNaN(regEndTs) && nowTs < regEndTs
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
router.get('/auction/product/:product_id', async (req: Request, res: Response) => {
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
router.get('/auction/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id

    if (!id) {
      return res.status(400).json({ error: 'Auction ID is required' })
    }

    await finalizeEndedAuctions()

    // Direct query - no RPC needed
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, gallery_images, min_increment, base_price, available_sizes')
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    // Get highest bid
    const { data: highestBid } = await supabaseAdmin
      .from('bids')
      .select('amount, bidder:bidder_id(name)')
      .eq('auction_id', id)
      .order('amount', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get total bids
    const { count: totalBids } = await supabaseAdmin
      .from('bids')
      .select('id', { count: 'exact', head: true })
      .eq('auction_id', id)

    // Get winners if auction ended
    let winnersList: { size: string | null; winning_amount: number; winner_name: string | null; declared_at: string | null }[] = []
    let winningAmount: number | null = null
    let winnerName: string | null = null
    let winnerDeclaredAt: string | null = null

    if (auction.status === 'ended') {
      const { data: winnersRows } = await supabaseAdmin
        .from('winners')
        .select('size, winning_amount, declared_at, bidder:bidder_id(name)')
        .eq('auction_id', id)

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

    // Display values
    const displayAmount = winningAmount ?? (highestBid as any)?.amount ?? null
    const displayName = winnerName ?? (Array.isArray((highestBid as any)?.bidder) ? ((highestBid as any).bidder[0] as any)?.name : ((highestBid as any)?.bidder as any)?.name) ?? null

    // Calculate highest bids by size if multi-size auction
    const sizes = Array.isArray(auction.available_sizes) ? auction.available_sizes : []
    let highest_bids_by_size: { size: string; amount: number; bidder_name: string | null }[] | null = null

    if (sizes.length > 0) {
      const { data: bids } = await supabaseAdmin
        .from('bids')
        .select('size, amount, bidder:bidder_id(name)')
        .eq('auction_id', id)

      const bySize: Record<string, { amount: number; bidder_name: string | null }> = {}
      for (const b of bids || []) {
        const s = String((b as any).size ?? '').trim()
        if (!s || !sizes.includes(s)) continue
        const amt = Number((b as any).amount)
        const bidder = (b as any).bidder as { name?: string } | { name?: string }[] | null
        const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null
        if (!bySize[s] || amt > bySize[s].amount) {
          bySize[s] = { amount: amt, bidder_name: name }
        }
      }
      highest_bids_by_size = sizes.map((s) => ({ size: s, amount: bySize[s]?.amount ?? 0, bidder_name: bySize[s]?.bidder_name ?? null }))
    }

    const data = {
      ...auction,
      current_highest_bid: displayAmount,
      highest_bidder_name: displayName,
      total_bids: totalBids ?? 0,
      winner_name: winnerName,
      winning_amount: winningAmount,
      winner_declared_at: winnerDeclaredAt,
      winners_by_size: winnersList,
      highest_bids_by_size
    }

    setNoCache(res)
    return res.json(data)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
