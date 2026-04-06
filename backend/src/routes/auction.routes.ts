import express, { Request, Response } from 'express'
import { createHash } from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'
import { setNoCache, setShortPublicCache } from '../middleware/cache'

const router = express.Router()
const liveStateCache = new Map<string, { expiresAt: number; payload: any }>()
const auctionsListCache = new Map<string, { expiresAt: number; payload: any }>()
const auctionDetailCache = new Map<string, { expiresAt: number; payload: any }>()

function setRouteCacheHeaders(res: Response, maxAgeSeconds: number): void {
  if (maxAgeSeconds <= 0) {
    setNoCache(res)
    return
  }
  setShortPublicCache(res, maxAgeSeconds, maxAgeSeconds * 3)
}

function pruneExpiredCacheEntries(cache: Map<string, { expiresAt: number; payload: any }>, nowTs: number, maxSize: number) {
  if (cache.size <= maxSize) return
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= nowTs) {
      cache.delete(key)
    }
  }
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NaN : ts
}

function isDataUri(value: string): boolean {
  return /^data:[^;]+;base64,/i.test(value)
}

function sanitizeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isDataUri(trimmed)) return null
  return trimmed
}

function sanitizeMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized: string[] = []
  for (const item of value) {
    const cleaned = sanitizeMediaUrl(item)
    if (cleaned) normalized.push(cleaned)
  }
  return normalized
}

function isWithinWindow(nowTs: number, start: string | null | undefined, end: string | null | undefined): boolean {
  const startTs = parseTimestamp(start)
  const endTs = parseTimestamp(end)
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) return false
  return nowTs >= startTs && nowTs <= endTs
}

function getAuctionPhase(nowTs: number, start: string | null | undefined, end: string | null | undefined): 'upcoming' | 'live' | 'ended' {
  const startTs = parseTimestamp(start)
  const endTs = parseTimestamp(end)
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) return 'ended'
  if (nowTs < startTs) return 'upcoming'
  if (nowTs > endTs) return 'ended'
  return 'live'
}

function createLiveStateVersion(payload: {
  id: string
  status: string
  bidding_end_time: string | null | undefined
  current_highest_bid: number
  total_bids: number
  highest_bidder_name: string | null
  highest_bids_by_size: any
}): string {
  const raw = JSON.stringify({
    id: payload.id,
    status: payload.status,
    bidding_end_time: payload.bidding_end_time || null,
    current_highest_bid: Number(payload.current_highest_bid || 0),
    total_bids: Number(payload.total_bids || 0),
    highest_bidder_name: payload.highest_bidder_name || null,
    highest_bids_by_size: Array.isArray(payload.highest_bids_by_size) ? payload.highest_bids_by_size : null
  })
  return createHash('sha1').update(raw).digest('hex').slice(0, 16)
}

function getWeakEtag(version: string): string {
  return `W/\"${version}\"`
}

function requestHasMatchingEtag(req: Request, etag: string): boolean {
  const ifNoneMatch = String(req.headers['if-none-match'] || '').trim()
  if (!ifNoneMatch) return false
  if (ifNoneMatch === '*') return true
  return ifNoneMatch.split(',').map((v) => v.trim()).includes(etag)
}

// Public: List auctions
router.get('/auctions', async (req: Request, res: Response) => {
  try {
    const nowTs = Date.now()
    const includeEnded = req.query.includeEnded === 'true'
    const requestedView = String(req.query.view || 'card').toLowerCase()
    const view: 'card' | 'past' | 'home' = requestedView === 'past' || requestedView === 'home' ? requestedView : 'card'
    const limitCap = view === 'home' ? 20 : 120
    const limitDefault = view === 'home' ? 20 : 60
    const limit = Math.min(limitCap, Math.max(5, Number(req.query.limit || limitDefault)))
    const cacheKey = `${includeEnded ? 'with-ended' : 'without-ended'}:${view}:${limit}`
    const cached = auctionsListCache.get(cacheKey)
    if (cached && cached.expiresAt > nowTs) {
      setRouteCacheHeaders(res, env.auctionListCacheSeconds)
      return res.json(cached.payload)
    }

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, status, registration_end_time, bidding_start_time, bidding_end_time, min_increment, base_price, banner_image, reel_url, gallery_images')
      .neq('status', 'draft')
      .order('bidding_start_time', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    const auctionsWithBids = await Promise.all(
      (auctions || []).map(async (auction: any) => {
        const derivedStatus = getAuctionPhase(nowTs, auction.bidding_start_time, auction.bidding_end_time)
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

        let winningAmount: number | null = null
        let winnerName: string | null = null
        let winnersCount = 0
        let topWinningAmount: number | null = null

        if (derivedStatus === 'ended' && view !== 'card') {
          const { data: winnersRows } = await supabaseAdmin
            .from('winners')
            .select('winning_amount, bidder:bidder_id(name)')
            .eq('auction_id', auction.id)

          if (winnersRows && winnersRows.length > 0) {
            winnersCount = winnersRows.length
            let maxWinner: { amount: number; name: string | null } | null = null

            for (const w of winnersRows) {
              const name = Array.isArray(w?.bidder) ? (w.bidder[0] as any)?.name : (w?.bidder as any)?.name ?? null
              const amount = Number(w.winning_amount) || 0
              if (!maxWinner || amount > maxWinner.amount) {
                maxWinner = {
                  amount,
                  name
                }
              }
            }

            topWinningAmount = maxWinner?.amount ?? null
            winningAmount = topWinningAmount
            winnerName = maxWinner?.name ?? null
          }
        }

        const displayAmount = winningAmount ?? highestBid?.amount ?? null
        const displayName = winnerName ?? (Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as any)?.name : (highestBid?.bidder as any)?.name) ?? null

        return {
          id: auction.id,
          title: auction.title,
          status: derivedStatus,
          registration_end_time: auction.registration_end_time,
          bidding_start_time: auction.bidding_start_time,
          bidding_end_time: auction.bidding_end_time,
          min_increment: auction.min_increment,
          base_price: auction.base_price,
          banner_image: sanitizeMediaUrl(auction.banner_image),
          reel_url: sanitizeMediaUrl(auction.reel_url),
          gallery_images: sanitizeMediaUrls(auction.gallery_images),
          current_highest_bid: displayAmount,
          highest_bidder_name: displayName,
          total_bids: count ?? 0,
          winner_name: winnerName,
          winning_amount: winningAmount,
          winners_count: winnersCount,
          top_winning_amount: topWinningAmount
        }
      })
    )

    const filteredAuctions = includeEnded
      ? auctionsWithBids
      : auctionsWithBids.filter((auction: any) => auction.status !== 'ended')

    const payload = { success: true, auctions: filteredAuctions }
    auctionsListCache.set(cacheKey, {
      payload,
      expiresAt: nowTs + Math.max(1, env.auctionListCacheSeconds) * 1000
    })
    pruneExpiredCacheEntries(auctionsListCache, nowTs, 20)
    setRouteCacheHeaders(res, env.auctionListCacheSeconds)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Active auction
router.get('/auction/active', async (_req: Request, res: Response) => {
  try {
    const nowTs = Date.now()
    const cacheKey = 'active-auction'
    const cacheTtlSeconds = Math.max(5, Math.min(env.auctionDetailCacheIdleSeconds, 20))
    const cached = auctionDetailCache.get(cacheKey)
    if (cached && cached.expiresAt > nowTs) {
      setRouteCacheHeaders(res, cacheTtlSeconds)
      return res.json(cached.payload)
    }

    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('id, status, registration_end_time, bidding_start_time, bidding_end_time')
      .neq('status', 'draft')
      .order('bidding_start_time', { ascending: true })

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch auctions' })
    }

    if (!auctions || auctions.length === 0) {
      const payload = { exists: false }
      auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + cacheTtlSeconds * 1000 })
      setRouteCacheHeaders(res, cacheTtlSeconds)
      return res.json(payload)
    }

    const liveAuction = auctions.find((auction: any) => isWithinWindow(nowTs, auction.bidding_start_time, auction.bidding_end_time))

    if (liveAuction) {
      const payload = {
        exists: true,
        auction_id: liveAuction.id,
        phase: 'live',
        cta: 'Place Bid'
      }
      auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + cacheTtlSeconds * 1000 })
      setRouteCacheHeaders(res, cacheTtlSeconds)
      return res.json(payload)
    }

    const registrationAuction = auctions.find((auction: any) => {
      if (getAuctionPhase(nowTs, auction.bidding_start_time, auction.bidding_end_time) !== 'upcoming') return false
      const startTs = parseTimestamp(auction.bidding_start_time)
      const regEndTs = parseTimestamp(auction.registration_end_time)
      if (Number.isNaN(startTs)) return false
      return nowTs < startTs && !Number.isNaN(regEndTs) && nowTs < regEndTs
    })

    if (registrationAuction) {
      const payload = {
        exists: true,
        auction_id: registrationAuction.id,
        phase: 'registration',
        cta: 'Register Now'
      }
      auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + cacheTtlSeconds * 1000 })
      setRouteCacheHeaders(res, cacheTtlSeconds)
      return res.json(payload)
    }

    const payload = { exists: false }
    auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + cacheTtlSeconds * 1000 })
    setRouteCacheHeaders(res, cacheTtlSeconds)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Auction by product ID
router.get('/auction/product/:product_id', async (req: Request, res: Response) => {
  try {
    const nowTs = Date.now()
    const product_id = req.params.product_id

    if (!product_id) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    const cacheKey = `product:${product_id}`
    const cached = auctionDetailCache.get(cacheKey)
    if (cached && cached.expiresAt > nowTs) {
      const cacheTtlSeconds = Math.max(3, Math.min(env.auctionDetailCacheLiveSeconds, 10))
      setRouteCacheHeaders(res, cacheTtlSeconds)
      return res.json(cached.payload)
    }

    const { data: auction, error } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment')
      .eq('product_id', product_id)
      .single()

    if (error || !auction) {
      return res.status(404).json({ error: 'Auction not found for this product' })
    }

    const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time)
    if (derivedStatus !== 'live') {
      return res.status(404).json({ error: 'No live auction found for this product' })
    }

    const { data: highestBid } = await supabaseAdmin
      .from('bids')
      .select('amount, bidder:bidder_id(name)')
      .eq('auction_id', auction.id)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { amount: number; bidder: { name: string } | { name: string }[] | null } | null }

    const payload = {
      ...auction,
      banner_image: sanitizeMediaUrl(auction.banner_image),
      reel_url: sanitizeMediaUrl(auction.reel_url),
      status: derivedStatus,
      current_highest_bid: highestBid?.amount ?? null,
      highest_bidder_name: Array.isArray(highestBid?.bidder) ? (highestBid.bidder[0] as any)?.name : (highestBid?.bidder as any)?.name ?? null
    }
    const cacheTtlSeconds = Math.max(3, Math.min(env.auctionDetailCacheLiveSeconds, 10))
    auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + cacheTtlSeconds * 1000 })
    pruneExpiredCacheEntries(auctionDetailCache, nowTs, 1000)
    setRouteCacheHeaders(res, cacheTtlSeconds)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Lightweight live-state refresh payload (used during active realtime bidding)
router.get('/auction/:id/live-state', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const liveStateCacheSeconds = Math.max(1, env.auctionLiveStateCacheSeconds)
    if (!id) {
      return res.status(400).json({ error: 'Auction ID is required' })
    }

    const now = Date.now()
    const cached = liveStateCache.get(id)
    if (cached && cached.expiresAt > now) {
      const snapshotVersion = String((cached.payload as any)?.snapshot_version || '')
      if (snapshotVersion) {
        const etag = getWeakEtag(snapshotVersion)
        res.setHeader('ETag', etag)
        if (requestHasMatchingEtag(req, etag)) {
          setRouteCacheHeaders(res, liveStateCacheSeconds)
          return res.status(304).end()
        }
      }
      setRouteCacheHeaders(res, liveStateCacheSeconds)
      return res.json(cached.payload)
    }

    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, status, bidding_start_time, bidding_end_time')
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time)
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .rpc('get_auction_live_snapshot', { p_auction_id: id })
      .single()

    if (snapshotError) {
      console.error('Live snapshot RPC error:', snapshotError)
      return res.status(500).json({ error: 'Failed to fetch live auction snapshot' })
    }

    const basePayload = {
      id: auction.id,
      status: derivedStatus,
      bidding_end_time: auction.bidding_end_time,
      current_highest_bid: Number((snapshot as any)?.current_highest_bid ?? 0),
      total_bids: Number((snapshot as any)?.total_bids ?? 0),
      highest_bidder_name: (snapshot as any)?.highest_bidder_name ?? null,
      highest_bids_by_size: Array.isArray((snapshot as any)?.highest_bids_by_size)
        ? (snapshot as any).highest_bids_by_size
        : null
    }

    const snapshot_version = createLiveStateVersion(basePayload)
    const payload = {
      ...basePayload,
      snapshot_version
    }

    const etag = getWeakEtag(snapshot_version)
    res.setHeader('ETag', etag)
    if (requestHasMatchingEtag(req, etag)) {
      setRouteCacheHeaders(res, liveStateCacheSeconds)
      return res.status(304).end()
    }

    liveStateCache.set(id, { payload, expiresAt: now + liveStateCacheSeconds * 1000 })
    if (liveStateCache.size > 500) {
      for (const [key, entry] of liveStateCache.entries()) {
        if (entry.expiresAt <= now) {
          liveStateCache.delete(key)
        }
      }
    }

    setRouteCacheHeaders(res, liveStateCacheSeconds)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Auction detail with media (for initial page load)
router.get('/auction/:id/details', async (req: Request, res: Response) => {
  try {
    const nowTs = Date.now()
    const id = req.params.id

    if (!id) {
      return res.status(400).json({ error: 'Auction ID is required' })
    }

    const cacheKey = `auction-details:${id}`
    const cached = auctionDetailCache.get(cacheKey)
    if (cached && cached.expiresAt > nowTs) {
      const cachedPayload = cached.payload as any
      const ttl = cachedPayload?.status === 'live'
        ? Math.max(1, env.auctionDetailCacheLiveSeconds)
        : Math.max(5, env.auctionDetailCacheIdleSeconds)
      setRouteCacheHeaders(res, ttl)
      return res.json(cached.payload)
    }

    // Direct query - no RPC needed
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, gallery_images, min_increment, base_price, available_sizes')
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time)

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .rpc('get_auction_live_snapshot', { p_auction_id: id })
      .single()
    if (snapshotError) {
      console.error('Auction snapshot RPC error:', snapshotError)
      return res.status(500).json({ error: 'Failed to fetch auction snapshot' })
    }

    // Get winners if auction ended
    let winnersList: { size: string | null; winning_amount: number; winner_name: string | null; declared_at: string | null }[] = []
    let winningAmount: number | null = null
    let winnerName: string | null = null
    let winnerDeclaredAt: string | null = null

    if (derivedStatus === 'ended') {
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
    const displayAmount = winningAmount ?? Number((snapshot as any)?.current_highest_bid ?? 0)
    const displayName = winnerName ?? ((snapshot as any)?.highest_bidder_name ?? null)
    const highest_bids_by_size = Array.isArray((snapshot as any)?.highest_bids_by_size)
      ? (snapshot as any).highest_bids_by_size
      : null

    const payload = {
      ...auction,
      banner_image: sanitizeMediaUrl(auction.banner_image),
      reel_url: sanitizeMediaUrl(auction.reel_url),
      gallery_images: sanitizeMediaUrls(auction.gallery_images),
      status: derivedStatus,
      current_highest_bid: displayAmount,
      highest_bidder_name: displayName,
      total_bids: Number((snapshot as any)?.total_bids ?? 0),
      winner_name: winnerName,
      winning_amount: winningAmount,
      winner_declared_at: winnerDeclaredAt,
      winners_by_size: winnersList,
      highest_bids_by_size
    }
    const ttl = derivedStatus === 'live'
      ? Math.max(1, env.auctionDetailCacheLiveSeconds)
      : Math.max(5, env.auctionDetailCacheIdleSeconds)
    auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + ttl * 1000 })
    pruneExpiredCacheEntries(auctionDetailCache, nowTs, 1000)
    setRouteCacheHeaders(res, ttl)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Public: Lightweight auction payload (no media) for realtime-safe refreshes
router.get('/auction/:id', async (req: Request, res: Response) => {
  try {
    const nowTs = Date.now()
    const id = req.params.id

    if (!id) {
      return res.status(400).json({ error: 'Auction ID is required' })
    }

    const cacheKey = `auction:${id}`
    const cached = auctionDetailCache.get(cacheKey)
    if (cached && cached.expiresAt > nowTs) {
      const cachedPayload = cached.payload as any
      const ttl = cachedPayload?.status === 'live'
        ? Math.max(1, env.auctionDetailCacheLiveSeconds)
        : Math.max(5, env.auctionDetailCacheIdleSeconds)
      setRouteCacheHeaders(res, ttl)
      return res.json(cached.payload)
    }

    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, min_increment, base_price, available_sizes')
      .eq('id', id)
      .single()

    if (auctionError || !auction) {
      return res.status(404).json({ error: 'Auction not found' })
    }

    const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time)

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .rpc('get_auction_live_snapshot', { p_auction_id: id })
      .single()
    if (snapshotError) {
      console.error('Auction snapshot RPC error:', snapshotError)
      return res.status(500).json({ error: 'Failed to fetch auction snapshot' })
    }

    let winnersList: { size: string | null; winning_amount: number; winner_name: string | null; declared_at: string | null }[] = []
    let winningAmount: number | null = null
    let winnerName: string | null = null
    let winnerDeclaredAt: string | null = null

    if (derivedStatus === 'ended') {
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

    const displayAmount = winningAmount ?? Number((snapshot as any)?.current_highest_bid ?? 0)
    const displayName = winnerName ?? ((snapshot as any)?.highest_bidder_name ?? null)
    const highest_bids_by_size = Array.isArray((snapshot as any)?.highest_bids_by_size)
      ? (snapshot as any).highest_bids_by_size
      : null

    const payload = {
      ...auction,
      status: derivedStatus,
      current_highest_bid: displayAmount,
      highest_bidder_name: displayName,
      total_bids: Number((snapshot as any)?.total_bids ?? 0),
      winner_name: winnerName,
      winning_amount: winningAmount,
      winner_declared_at: winnerDeclaredAt,
      winners_by_size: winnersList,
      highest_bids_by_size
    }
    const ttl = derivedStatus === 'live'
      ? Math.max(1, env.auctionDetailCacheLiveSeconds)
      : Math.max(5, env.auctionDetailCacheIdleSeconds)
    auctionDetailCache.set(cacheKey, { payload, expiresAt: nowTs + ttl * 1000 })
    pruneExpiredCacheEntries(auctionDetailCache, nowTs, 1000)
    setRouteCacheHeaders(res, ttl)
    return res.json(payload)
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
