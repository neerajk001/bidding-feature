import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { supabaseAdmin } from '../config/supabase'
import { requireAdmin } from '../middleware/auth'
import { sendPaymentConfirmedEmail, sendWinnerEmail } from '../services/email.service'
import { getLastWinnerEmailError } from '../services/email.service'
import { finalizeEndedAuctions } from '../services/auction.service'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NaN : ts
}

// Custom upload middleware for admin routes (handles any fieldname)
function maybeUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'] || ''
  if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
    return upload.any()(req, res, next)
  }
  return next()
}

// Protect all admin routes
router.use(requireAdmin)

// GET /admin/auctions - List all auctions
router.get('/auctions', async (_req: Request, res: Response) => {
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

// POST /admin/auctions - Create auction with uploads
router.post('/auctions', maybeUpload, async (req: Request, res: Response) => {
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

    const { data: overlappingAuctions, error: overlapError } = await supabaseAdmin
      .from('auctions')
      .select('id, title, bidding_start_time, bidding_end_time')
      .lt('bidding_start_time', biddingEndUTC)
      .gt('bidding_end_time', biddingStartUTC)
      .limit(1)

    if (overlapError) {
      return res.status(500).json({ error: 'Failed to validate auction time window', details: overlapError.message })
    }

    if (overlappingAuctions && overlappingAuctions.length > 0) {
      return res.status(400).json({
        error: 'Auction time conflicts with an existing auction. Please choose a time after the last auction ends.'
      })
    }

    const { data: latestAuction, error: latestAuctionError } = await supabaseAdmin
      .from('auctions')
      .select('id, bidding_end_time')
      .order('bidding_end_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestAuctionError) {
      return res.status(500).json({ error: 'Failed to validate latest auction end time', details: latestAuctionError.message })
    }

    if (latestAuction?.bidding_end_time) {
      const latestEndTs = parseTimestamp(latestAuction.bidding_end_time)
      const newStartTs = parseTimestamp(biddingStartUTC)
      if (!Number.isNaN(latestEndTs) && !Number.isNaN(newStartTs) && newStartTs <= latestEndTs) {
        return res.status(400).json({
          error: 'Auction time conflicts with an existing auction. Please choose a time after the last auction ends.'
        })
      }
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

// GET /admin/auctions/:id - Get auction details
router.get('/auctions/:id', async (req: Request, res: Response) => {
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

// PUT /admin/auctions/:id - Update auction
router.put('/auctions/:id', async (req: Request, res: Response) => {
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
      const availableSizes: string[] = Array.isArray(updatedAuction?.available_sizes) ? updatedAuction.available_sizes : []
      const sizeSet = new Set<string>()
      for (const s of availableSizes) {
        const trimmed = String(s ?? '').trim()
        if (trimmed) sizeSet.add(trimmed)
      }

      const { data: bidSizes, error: bidSizesError } = await supabaseAdmin
        .from('bids')
        .select('size')
        .eq('auction_id', auctionId)
        .not('size', 'is', null)

      if (bidSizesError) {
        console.error('Failed to load bid sizes:', bidSizesError)
      } else {
        for (const row of bidSizes || []) {
          const trimmed = String((row as any).size ?? '').trim()
          if (trimmed) sizeSet.add(trimmed)
        }
      }

      const sizes = Array.from(sizeSet)
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
            const paymentDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
            const { error: winnerError } = await supabaseAdmin
              .from('winners')
              .upsert(
                {
                  auction_id: auctionId,
                  bidder_id: highestBid.bidder_id,
                  winning_amount: winningAmount,
                  declared_at: nowIso,
                  size,
                  payment_due_at: paymentDueAt,
                  payment_status: 'pending',
                  claim_token: crypto.randomUUID()
                },
                { onConflict: 'auction_id,size', ignoreDuplicates: true }
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
          const paymentDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
          const { error: winnerError } = await supabaseAdmin
            .from('winners')
            .upsert(
              {
                auction_id: auctionId,
                bidder_id: highestBid.bidder_id,
                winning_amount: winningAmount,
                declared_at: nowIso,
                size: null,
                payment_due_at: paymentDueAt,
                payment_status: 'pending',
                claim_token: crypto.randomUUID()
              },
              { onConflict: 'auction_id,size', ignoreDuplicates: true }
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

// DELETE /admin/auctions/:id - Delete auction
router.delete('/auctions/:id', async (req: Request, res: Response) => {
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

// GET /admin/bidders - List bidders
router.get('/bidders', async (_req: Request, res: Response) => {
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

// GET /admin/dashboard - Get stats
router.get('/dashboard', async (_req: Request, res: Response) => {
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

// POST /admin/upload-url - Supabase signed upload
router.post('/upload-url', async (req: Request, res: Response) => {
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

// GET /admin/winners - List winners
router.get('/winners', async (_req: Request, res: Response) => {
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
        shipping_address,
        shipping_address_submitted_at,
        dispatched_at,
        escalation_done,
        bidder:bidder_id(name, phone, email),
        auction:auction_id(title, product_id, bidding_start_time, bidding_end_time)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Normalize bidder/auction: Supabase may return relations as arrays or objects
    const normalizedWinners = (winners || []).map((w: any) => {
      const bidder = Array.isArray(w.bidder) ? w.bidder[0] : w.bidder
      const auction = Array.isArray(w.auction) ? w.auction[0] : w.auction
      return {
        ...w,
        bidder: bidder ?? { name: 'Unknown', phone: '', email: '' },
        auction: auction ?? { title: 'Unknown', product_id: '', bidding_start_time: null, bidding_end_time: null }
      }
    })

    return res.json({
      success: true,
      winners: normalizedWinners
    })
  } catch (error: any) {
    console.error('Winners API error:', error)
    return res.status(500).json({
      error: 'Failed to fetch winners',
      message: error.message
    })
  }
})

// PATCH /admin/winners/:id - Update winner
router.patch('/winners/:id', async (req: Request, res: Response) => {
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

// POST /admin/winners/:id/resend-email - Force resend winner notification email
router.post('/winners/:id/resend-email', async (req: Request, res: Response) => {
  try {
    const id = req.params.id

    // Fetch the winner with bidder + auction info
    const { data: winner, error: fetchErr } = await supabaseAdmin
      .from('winners')
      .select('id, auction_id, bidder_id, winning_amount, claim_token, size, payment_status')
      .eq('id', id)
      .single()

    if (fetchErr || !winner) {
      return res.status(404).json({ error: 'Winner not found' })
    }

    const w = winner as any

    // Ensure claim_token exists (backfill if missing)
    let claimToken = w.claim_token
    if (!claimToken) {
      claimToken = crypto.randomUUID()
      await supabaseAdmin.from('winners').update({
        claim_token: claimToken,
        payment_status: w.payment_status || 'pending',
        payment_due_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      }).eq('id', id)
    }

    const { data: auction } = await supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single()
    const { data: bidder } = await supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single()

    if (!(bidder as any)?.email) {
      return res.status(400).json({ error: 'Bidder has no email address registered' })
    }

    // Reset winner_email_sent_at so it's queryable as unsent
    await supabaseAdmin.from('winners').update({ winner_email_sent_at: null }).eq('id', id)

    // Send the email
    const emailSent = await sendWinnerEmail({
      to: (bidder as any).email,
      winnerName: (bidder as any)?.name || 'Winner',
      auctionTitle: (auction as any)?.title || 'Auction',
      winningAmount: Number(w.winning_amount),
      claimToken,
      size: w.size,
      isEscalation: false
    })

    if (!emailSent) {
      const detail = getLastWinnerEmailError()
      return res.status(500).json({
        error: 'Email service failed. Check RESEND_API_KEY and domain verification in Resend dashboard.',
        details: detail || 'Unknown email provider failure'
      })
    }

    // Mark as sent
    await supabaseAdmin.from('winners').update({ winner_email_sent_at: new Date().toISOString() }).eq('id', id)

    return res.json({ ok: true, message: `Email sent to ${(bidder as any).email}` })
  } catch (error: any) {
    console.error('Resend email error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to resend email' })
  }
})

// POST /admin/trigger-winner-emails - Manually trigger winner email notifications
router.post('/trigger-winner-emails', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString()

    // Finalize ended auctions to ensure winners exist
    await finalizeEndedAuctions()

    // ── STEP 1: Backfill winners missing claim_token / payment_status ────────────
    // This covers winners created by the old PUT /admin/auctions/:id route that
    // didn't set those fields, and any existing winners in the DB before this fix.
    const { data: incompleteWinners, error: incompleteErr } = await supabaseAdmin
      .from('winners')
      .select('id, payment_status, claim_token, payment_due_at')
      .or('claim_token.is.null,payment_status.is.null')

    console.log(`[trigger-winner-emails] Step1: incompleteWinners=${incompleteWinners?.length ?? 0}, err=${incompleteErr?.message}`)

    if (incompleteWinners && incompleteWinners.length > 0) {
      for (const iw of incompleteWinners) {
        const patch: Record<string, any> = {}
        if (!iw.claim_token) {
          patch.claim_token = crypto.randomUUID()
        }
        if (!iw.payment_status) {
          patch.payment_status = 'pending'
        }
        if (!iw.payment_due_at) {
          patch.payment_due_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        }
        if (Object.keys(patch).length > 0) {
          console.log(`[trigger-winner-emails] Patching winner ${iw.id} with:`, patch)
          const { error: patchErr } = await supabaseAdmin.from('winners').update(patch).eq('id', iw.id)
          if (patchErr) console.error(`[trigger-winner-emails] Patch error for ${iw.id}:`, patchErr.message)
        }
      }
    }

    // ── STEP 2: Find all winners still pending email notification ─────────────────
    const { data: toNotify, error: fetchError } = await supabaseAdmin
      .from('winners')
      .select('id, auction_id, bidder_id, winning_amount, claim_token, size, payment_status, winner_email_sent_at')
      .eq('payment_status', 'pending')
      .not('claim_token', 'is', null)
      .is('winner_email_sent_at', null)

    console.log(`[trigger-winner-emails] Step2: toNotify=${toNotify?.length ?? 0}, fetchError=${fetchError?.message}`)

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch winners', details: fetchError.message })
    }

    if (!toNotify || toNotify.length === 0) {
      // Also fetch ALL winners to show debug info
      const { data: allWinners } = await supabaseAdmin
        .from('winners')
        .select('id, payment_status, claim_token, winner_email_sent_at, bidder_id')

      console.log('[trigger-winner-emails] All winners in DB:', JSON.stringify(allWinners, null, 2))

      return res.json({
        success: true,
        message: 'No winners pending notification',
        sent: 0,
        failed: 0,
        debug: {
          allWinnersInDb: (allWinners || []).map(w => ({
            id: w.id,
            payment_status: w.payment_status,
            has_claim_token: !!w.claim_token,
            email_sent: !!w.winner_email_sent_at,
            bidder_id: w.bidder_id
          }))
        }
      })
    }

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const w of toNotify) {
      try {
        const { data: auction } = await supabaseAdmin
          .from('auctions')
          .select('title')
          .eq('id', w.auction_id)
          .single()

        const { data: bidder } = await supabaseAdmin
          .from('bidders')
          .select('name, email')
          .eq('id', w.bidder_id)
          .single()

        console.log(`[trigger-winner-emails] Winner ${w.id}: bidder email=${(bidder as any)?.email}, has claim_token=${!!w.claim_token}`)

        if (!(bidder as any)?.email || !w.claim_token) {
          const reason = !(bidder as any)?.email ? 'bidder has no email address' : 'missing claim_token'
          errors.push(`Winner ${w.id}: ${reason}`)
          console.warn(`[trigger-winner-emails] Skipping winner ${w.id}: ${reason}`)
          failed++
          continue
        }

        const emailSent = await sendWinnerEmail({
          to: (bidder as any).email,
          winnerName: (bidder as any)?.name || 'Winner',
          auctionTitle: (auction as any)?.title || 'Auction',
          winningAmount: Number(w.winning_amount),
          claimToken: w.claim_token,
          size: w.size,
          isEscalation: false
        })

        console.log(`[trigger-winner-emails] Email send result for winner ${w.id}: ${emailSent}`)

        if (emailSent) {
          await supabaseAdmin
            .from('winners')
            .update({ winner_email_sent_at: now })
            .eq('id', w.id)
          sent++
        } else {
          const detail = getLastWinnerEmailError()
          errors.push(`Winner ${w.id}: Resend API call failed (check RESEND_API_KEY and domain verification). ${detail || ''}`.trim())
          failed++
        }
      } catch (err: any) {
        errors.push(`Winner ${w.id}: ${err.message}`)
        failed++
        console.error(`[trigger-winner-emails] Exception for winner ${w.id}:`, err)
      }
    }

    return res.json({
      success: true,
      sent,
      failed,
      total: toNotify.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('Trigger winner emails error:', error)
    return res.status(500).json({ error: 'Failed to trigger emails', details: error.message })
  }
})

// GET /admin/settings/admin-emails - Get all admin emails
router.get('/settings/admin-emails', async (_req: Request, res: Response) => {
  try {
    // Get from database
    const { data: setting, error } = await supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_emails')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching admin emails:', error)
      return res.status(500).json({ error: 'Failed to fetch admin emails' })
    }

    const dbEmails = setting?.value || []
    
    // Also return env emails for reference
    const envEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)

    return res.json({
      success: true,
      adminEmails: Array.isArray(dbEmails) ? dbEmails : [],
      envEmails: envEmails,
      source: 'database'
    })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /admin/settings/admin-emails - Add an admin email
router.post('/settings/admin-emails', async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Get current admin emails
    const { data: setting, error: fetchError } = await supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_emails')
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching admin emails:', fetchError)
      return res.status(500).json({ error: 'Failed to fetch current admin emails' })
    }

    const currentEmails = Array.isArray(setting?.value) ? setting.value : []

    // Check if email already exists
    if (currentEmails.includes(normalizedEmail)) {
      return res.status(400).json({ error: 'Email already exists in admin list' })
    }

    // Add new email
    const updatedEmails = [...currentEmails, normalizedEmail]

    // Upsert the setting
    const { error: upsertError } = await supabaseAdmin
      .from('admin_settings')
      .upsert({
        key: 'admin_emails',
        value: updatedEmails,
        updated_at: new Date().toISOString(),
        updated_by: normalizedEmail
      }, {
        onConflict: 'key'
      })

    if (upsertError) {
      console.error('Error upserting admin email:', upsertError)
      return res.status(500).json({ error: 'Failed to add admin email' })
    }

    return res.json({
      success: true,
      message: 'Admin email added successfully',
      adminEmails: updatedEmails
    })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /admin/settings/admin-emails - Remove an admin email
router.delete('/settings/admin-emails', async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Get current admin emails
    const { data: setting, error: fetchError } = await supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_emails')
      .single()

    if (fetchError) {
      console.error('Error fetching admin emails:', fetchError)
      return res.status(500).json({ error: 'Failed to fetch current admin emails' })
    }

    const currentEmails = Array.isArray(setting?.value) ? setting.value : []

    // Check if email exists
    if (!currentEmails.includes(normalizedEmail)) {
      return res.status(404).json({ error: 'Email not found in admin list' })
    }

    // Prevent removing the last admin
    if (currentEmails.length === 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin email' })
    }

    // Remove email
    const updatedEmails = currentEmails.filter((e: string) => e !== normalizedEmail)

    // Update the setting
    const { error: updateError } = await supabaseAdmin
      .from('admin_settings')
      .update({
        value: updatedEmails,
        updated_at: new Date().toISOString()
      })
      .eq('key', 'admin_emails')

    if (updateError) {
      console.error('Error updating admin emails:', updateError)
      return res.status(500).json({ error: 'Failed to remove admin email' })
    }

    return res.json({
      success: true,
      message: 'Admin email removed successfully',
      adminEmails: updatedEmails
    })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
