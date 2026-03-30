"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const email_service_1 = require("../services/email.service");
const email_service_2 = require("../services/email.service");
const auction_service_1 = require("../services/auction.service");
const winner_offer_service_1 = require("../services/winner-offer.service");
const delhivery_service_1 = require("../services/delhivery.service");
const env_1 = require("../config/env");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
function parseTimestamp(value) {
    if (!value)
        return Number.NaN;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NaN : ts;
}
function cleanText(value) {
    return String(value ?? '').trim();
}
function normalizeShippingAddress(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'Shipping address is required before dispatch.' };
    }
    const raw = input;
    const address = {
        full_name: cleanText(raw.full_name),
        phone: cleanText(raw.phone),
        line1: cleanText(raw.line1),
        line2: cleanText(raw.line2),
        city: cleanText(raw.city),
        state: cleanText(raw.state),
        postal_code: cleanText(raw.postal_code),
        country: cleanText(raw.country) || 'India'
    };
    const requiredFields = ['full_name', 'phone', 'line1', 'city', 'state', 'postal_code'];
    for (const field of requiredFields) {
        if (!address[field]) {
            return { error: `Shipping ${field.replace('_', ' ')} is required before dispatch.` };
        }
    }
    return { address };
}
// Custom upload middleware for admin routes (handles any fieldname)
function maybeUpload(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
        return upload.any()(req, res, next);
    }
    return next();
}
// Protect all admin routes
router.use(auth_1.requireAdmin);
// GET /admin/auctions - List all auctions
router.get('/auctions', async (_req, res) => {
    try {
        const { data: auctions, error } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch auctions' });
        }
        return res.json({ auctions });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /admin/auctions - Create auction with uploads
router.post('/auctions', maybeUpload, async (req, res) => {
    try {
        const contentType = req.headers['content-type'] || '';
        const ALLOWED_REEL_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
        const MAX_REEL_MB = 50;
        const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media';
        let body = {};
        let reelFile = null;
        let galleryUrls = [];
        if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
            const getString = (key) => {
                const value = req.body?.[key];
                return typeof value === 'string' ? value : '';
            };
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
            };
            const files = (req.files || []);
            reelFile = files.find((file) => file.fieldname === 'reel') || null;
            const galleryFiles = files.filter((file) => file.fieldname === 'gallery');
            if (galleryFiles && galleryFiles.length > 0) {
                for (const file of galleryFiles) {
                    if (!file.mimetype.startsWith('image/'))
                        continue;
                    if (file.size > 5 * 1024 * 1024)
                        continue;
                    const ext = file.originalname.split('.').pop() || 'jpg';
                    const path = `gallery/${crypto_1.default.randomUUID()}.${ext}`;
                    const { error: uploadError } = await supabase_1.supabaseAdmin
                        .storage
                        .from(bucket)
                        .upload(path, file.buffer, {
                        contentType: file.mimetype,
                        upsert: false
                    });
                    if (!uploadError) {
                        const { data: publicData } = supabase_1.supabaseAdmin.storage.from(bucket).getPublicUrl(path);
                        galleryUrls.push(publicData.publicUrl);
                    }
                }
            }
            const passedGalleryUrls = req.body?.gallery_urls;
            if (passedGalleryUrls) {
                if (Array.isArray(passedGalleryUrls)) {
                    passedGalleryUrls.forEach((url) => {
                        if (typeof url === 'string' && url.trim() !== '') {
                            galleryUrls.push(url);
                        }
                    });
                }
                else if (typeof passedGalleryUrls === 'string' && passedGalleryUrls.trim() !== '') {
                    galleryUrls.push(passedGalleryUrls);
                }
            }
        }
        else {
            body = (req.body || {});
            const passedGalleryUrls = body.gallery_urls;
            if (passedGalleryUrls) {
                if (Array.isArray(passedGalleryUrls)) {
                    galleryUrls.push(...passedGalleryUrls);
                }
                else if (typeof passedGalleryUrls === 'string') {
                    galleryUrls.push(passedGalleryUrls);
                }
            }
        }
        const { title, product_id, min_increment, base_price, banner_image, registration_end_time, bidding_start_time, bidding_end_time, status, reel_url, available_sizes } = body;
        const availableSizesArray = available_sizes
            ? String(available_sizes).split(',').map((s) => s.trim()).filter((s) => s.length > 0)
            : [];
        if (!title || !product_id || !min_increment || !registration_end_time || !bidding_start_time || !bidding_end_time || !status) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const validStatuses = ['draft', 'live', 'ended'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be draft, live, or ended' });
        }
        const minIncrementValue = typeof min_increment === 'number'
            ? min_increment
            : parseFloat(min_increment);
        if (!Number.isFinite(minIncrementValue) || minIncrementValue <= 0) {
            return res.status(400).json({ error: 'Minimum increment must be a positive number' });
        }
        let basePriceValue = null;
        if (base_price && base_price !== '') {
            basePriceValue = typeof base_price === 'number' ? base_price : parseFloat(base_price);
            if (!Number.isFinite(basePriceValue) || basePriceValue <= 0) {
                return res.status(400).json({ error: 'Base price must be a positive number' });
            }
        }
        const toIST = (dateStr) => {
            try {
                if (dateStr.includes('Z') || dateStr.includes('+'))
                    return new Date(dateStr);
                return new Date(`${dateStr}+05:30`);
            }
            catch (e) {
                return new Date('Invalid');
            }
        };
        let registrationEndUTC, biddingStartUTC, biddingEndUTC;
        try {
            const regEnd = toIST(registration_end_time);
            const bidStart = toIST(bidding_start_time);
            const bidEnd = toIST(bidding_end_time);
            if (Number.isNaN(regEnd.getTime()) || Number.isNaN(bidStart.getTime()) || Number.isNaN(bidEnd.getTime())) {
                throw new Error('Invalid date format provided');
            }
            registrationEndUTC = regEnd.toISOString();
            biddingStartUTC = bidStart.toISOString();
            biddingEndUTC = bidEnd.toISOString();
            if (regEnd >= bidStart) {
                return res.status(400).json({ error: 'Registration must end before bidding starts' });
            }
            if (bidStart >= bidEnd) {
                return res.status(400).json({ error: 'Bidding start time must be before end time' });
            }
        }
        catch (e) {
            return res.status(400).json({ error: e.message || 'Invalid date format' });
        }
        const { data: overlappingAuctions, error: overlapError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, bidding_start_time, bidding_end_time')
            .lt('bidding_start_time', biddingEndUTC)
            .gt('bidding_end_time', biddingStartUTC)
            .limit(1);
        if (overlapError) {
            return res.status(500).json({ error: 'Failed to validate auction time window', details: overlapError.message });
        }
        if (overlappingAuctions && overlappingAuctions.length > 0) {
            return res.status(400).json({
                error: 'Auction time conflicts with an existing auction. Please choose a time after the last auction ends.'
            });
        }
        const { data: latestAuction, error: latestAuctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, bidding_end_time')
            .order('bidding_end_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latestAuctionError) {
            return res.status(500).json({ error: 'Failed to validate latest auction end time', details: latestAuctionError.message });
        }
        if (latestAuction?.bidding_end_time) {
            const latestEndTs = parseTimestamp(latestAuction.bidding_end_time);
            const newStartTs = parseTimestamp(biddingStartUTC);
            if (!Number.isNaN(latestEndTs) && !Number.isNaN(newStartTs) && newStartTs <= latestEndTs) {
                return res.status(400).json({
                    error: 'Auction time conflicts with an existing auction. Please choose a time after the last auction ends.'
                });
            }
        }
        let reelPublicUrl = reel_url || null;
        if (reelFile) {
            if (!ALLOWED_REEL_TYPES.includes(reelFile.mimetype)) {
                return res.status(400).json({ error: 'Reel must be MP4, WebM, or MOV' });
            }
            const maxBytes = MAX_REEL_MB * 1024 * 1024;
            if (reelFile.size > maxBytes) {
                return res.status(400).json({ error: `Reel must be under ${MAX_REEL_MB}MB` });
            }
            const extension = reelFile.originalname.split('.').pop() || 'mp4';
            const reelPath = `reels/${crypto_1.default.randomUUID()}.${extension}`;
            const { error: uploadError } = await supabase_1.supabaseAdmin
                .storage
                .from(bucket)
                .upload(reelPath, reelFile.buffer, {
                contentType: reelFile.mimetype,
                upsert: false
            });
            if (uploadError) {
                return res.status(500).json({ error: 'Failed to upload reel', details: uploadError.message });
            }
            const { data: publicData } = supabase_1.supabaseAdmin.storage.from(bucket).getPublicUrl(reelPath);
            reelPublicUrl = publicData.publicUrl;
        }
        const { data, error } = await supabase_1.supabaseAdmin
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
            .single();
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to create auction', details: error.message });
        }
        return res.status(201).json({ success: true, auction: data });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
// GET /admin/auctions/:id - Get auction details
router.get('/auctions/:id', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { data: auction, error: auctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();
        if (auctionError || !auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const { data: bidders, error: biddersError } = await supabase_1.supabaseAdmin
            .from('bidders')
            .select('*')
            .eq('auction_id', auctionId)
            .order('created_at', { ascending: false });
        if (biddersError) {
            console.error('Error fetching bidders:', biddersError);
        }
        const { data: bids, error: bidsError } = await supabase_1.supabaseAdmin
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
            .order('amount', { ascending: false });
        if (bidsError) {
            console.error('Error fetching bids:', bidsError);
            const { data: simpleBids } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('*')
                .eq('auction_id', auctionId)
                .order('amount', { ascending: false });
            const bidsWithBidderInfo = simpleBids?.map(bid => {
                const bidder = bidders?.find(b => b.id === bid.bidder_id);
                return {
                    ...bid,
                    bidders: bidder ? {
                        id: bidder.id,
                        name: bidder.name,
                        phone: bidder.phone,
                        email: bidder.email
                    } : null
                };
            }) || [];
            const currentHighestBid = simpleBids && simpleBids.length > 0
                ? Math.max(...simpleBids.map(b => b.amount))
                : null;
            const biddersWithHighestBid = bidders?.map(bidder => {
                const bidderBids = simpleBids?.filter(bid => bid.bidder_id === bidder.id) || [];
                const highestBid = bidderBids.length > 0
                    ? Math.max(...bidderBids.map(b => b.amount))
                    : null;
                return {
                    ...bidder,
                    highest_bid: highestBid
                };
            }) || [];
            const { data: winnersRowsFallback } = await supabase_1.supabaseAdmin
                .from('winners')
                .select('id, auction_id, bidder_id, winning_amount, size, declared_at, bidder:bidder_id(name, phone, email)')
                .eq('auction_id', auctionId);
            const winners_by_size_fallback = (winnersRowsFallback || []).map((w) => {
                const bidder = w.bidder;
                const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null;
                const phone = Array.isArray(bidder) ? bidder[0]?.phone : bidder?.phone ?? null;
                const email = Array.isArray(bidder) ? bidder[0]?.email : bidder?.email ?? null;
                return {
                    size: w.size ?? null,
                    bidder_id: w.bidder_id,
                    winning_amount: w.winning_amount,
                    declared_at: w.declared_at,
                    winner_name: name,
                    winner_phone: phone,
                    winner_email: email
                };
            });
            return res.json({
                auction,
                bidders: biddersWithHighestBid,
                bids: bidsWithBidderInfo,
                current_highest_bid: currentHighestBid,
                winners_by_size: winners_by_size_fallback
            });
        }
        const currentHighestBid = bids && bids.length > 0
            ? Math.max(...bids.map((b) => b.amount))
            : null;
        const biddersWithHighestBid = bidders?.map(bidder => {
            const bidderBids = bids?.filter(bid => bid.bidder_id === bidder.id) || [];
            const highestBid = bidderBids.length > 0
                ? Math.max(...bidderBids.map(b => b.amount))
                : null;
            return {
                ...bidder,
                highest_bid: highestBid
            };
        }) || [];
        const { data: winnersRows } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, size, declared_at, bidder:bidder_id(name, phone, email)')
            .eq('auction_id', auctionId);
        const winners_by_size = (winnersRows || []).map((w) => {
            const bidder = w.bidder;
            const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null;
            const phone = Array.isArray(bidder) ? bidder[0]?.phone : bidder?.phone ?? null;
            const email = Array.isArray(bidder) ? bidder[0]?.email : bidder?.email ?? null;
            return {
                size: w.size ?? null,
                bidder_id: w.bidder_id,
                winning_amount: w.winning_amount,
                declared_at: w.declared_at,
                winner_name: name,
                winner_phone: phone,
                winner_email: email
            };
        });
        return res.json({
            auction,
            bidders: biddersWithHighestBid,
            bids: bids || [],
            current_highest_bid: currentHighestBid,
            winners_by_size
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /admin/auctions/:id - Update auction
router.put('/auctions/:id', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const body = req.body || {};
        const { title, product_id, min_increment, registration_end_time, bidding_start_time, bidding_end_time, status } = body;
        const { data: existingAuction, error: checkError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, status')
            .eq('id', auctionId)
            .single();
        if (checkError || !existingAuction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const updateData = {};
        if (title)
            updateData.title = title;
        if (product_id)
            updateData.product_id = product_id;
        if (min_increment)
            updateData.min_increment = parseFloat(min_increment);
        if (registration_end_time)
            updateData.registration_end_time = new Date(registration_end_time).toISOString();
        if (bidding_start_time)
            updateData.bidding_start_time = new Date(bidding_start_time).toISOString();
        if (bidding_end_time)
            updateData.bidding_end_time = new Date(bidding_end_time).toISOString();
        if (status)
            updateData.status = status;
        const { data: updatedAuction, error: updateError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .update(updateData)
            .eq('id', auctionId)
            .select()
            .single();
        if (updateError) {
            return res.status(500).json({ error: 'Failed to update auction', details: updateError.message });
        }
        if (status === 'ended') {
            const availableSizes = Array.isArray(updatedAuction?.available_sizes) ? updatedAuction.available_sizes : [];
            const sizeSet = new Set();
            for (const s of availableSizes) {
                const trimmed = String(s ?? '').trim();
                if (trimmed)
                    sizeSet.add(trimmed);
            }
            const { data: bidSizes, error: bidSizesError } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('size')
                .eq('auction_id', auctionId)
                .not('size', 'is', null);
            if (bidSizesError) {
                console.error('Failed to load bid sizes:', bidSizesError);
            }
            else {
                for (const row of bidSizes || []) {
                    const trimmed = String(row.size ?? '').trim();
                    if (trimmed)
                        sizeSet.add(trimmed);
                }
            }
            const sizes = Array.from(sizeSet);
            const nowIso = new Date().toISOString();
            if (sizes.length > 0) {
                for (const size of sizes) {
                    const { data: highestBid, error: highestBidError } = await supabase_1.supabaseAdmin
                        .from('bids')
                        .select('amount, bidder_id')
                        .eq('auction_id', auctionId)
                        .eq('size', size)
                        .order('amount', { ascending: false })
                        .order('created_at', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                    if (highestBidError) {
                        console.error('Failed to calculate winner for size', size, highestBidError);
                        continue;
                    }
                    const winningAmount = Number(highestBid?.amount ?? 0);
                    if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
                        const { error: winnerError } = await supabase_1.supabaseAdmin
                            .from('winners')
                            .upsert({
                            auction_id: auctionId,
                            ...(0, winner_offer_service_1.buildPendingWinnerOffer)({
                                bidderId: highestBid.bidder_id,
                                winningAmount,
                                declaredAt: nowIso,
                                size,
                                claimToken: crypto_1.default.randomUUID(),
                                escalationDone: false
                            }),
                            forfeited_bidder_ids: []
                        }, { onConflict: 'auction_id,size', ignoreDuplicates: true });
                        if (winnerError) {
                            console.error('Failed to save winner for size', size, winnerError);
                        }
                    }
                }
            }
            else {
                const { data: highestBid, error: highestBidError } = await supabase_1.supabaseAdmin
                    .from('bids')
                    .select('amount, bidder_id')
                    .eq('auction_id', auctionId)
                    .order('amount', { ascending: false })
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (highestBidError) {
                    console.error('Failed to calculate winner:', highestBidError);
                    return res.status(500).json({ error: 'Failed to calculate winner', details: highestBidError.message });
                }
                const winningAmount = Number(highestBid?.amount ?? 0);
                if (highestBid?.bidder_id && Number.isFinite(winningAmount) && winningAmount > 0) {
                    const { error: winnerError } = await supabase_1.supabaseAdmin
                        .from('winners')
                        .upsert({
                        auction_id: auctionId,
                        ...(0, winner_offer_service_1.buildPendingWinnerOffer)({
                            bidderId: highestBid.bidder_id,
                            winningAmount,
                            declaredAt: nowIso,
                            size: null,
                            claimToken: crypto_1.default.randomUUID(),
                            escalationDone: false
                        }),
                        forfeited_bidder_ids: []
                    }, { onConflict: 'auction_id,size', ignoreDuplicates: true });
                    if (winnerError) {
                        console.error('Failed to save winner:', winnerError);
                        return res.status(500).json({ error: 'Failed to save winner', details: winnerError.message });
                    }
                }
            }
        }
        return res.json({ success: true, auction: updatedAuction });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /admin/auctions/:id - Delete auction
router.delete('/auctions/:id', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { error: deleteError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .delete()
            .eq('id', auctionId);
        if (deleteError) {
            return res.status(500).json({ error: 'Failed to delete auction', details: deleteError.message });
        }
        return res.json({ success: true });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /admin/bidders - List bidders
router.get('/bidders', async (_req, res) => {
    try {
        const { data: bidders, error: biddersError } = await supabase_1.supabaseAdmin
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
            .order('created_at', { ascending: false });
        if (biddersError)
            throw biddersError;
        const biddersWithStats = await Promise.all((bidders || []).map(async (bidder) => {
            const { count: bidsCount } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('id', { count: 'exact', head: true })
                .eq('bidder_id', bidder.id);
            const { data: highestBidData } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('amount')
                .eq('bidder_id', bidder.id)
                .order('amount', { ascending: false })
                .limit(1)
                .single();
            return {
                ...bidder,
                registered_at: bidder.created_at,
                bids_count: bidsCount || 0,
                highest_bid: highestBidData?.amount || null
            };
        }));
        return res.json({
            success: true,
            bidders: biddersWithStats
        });
    }
    catch (error) {
        console.error('Bidders API error:', error);
        return res.status(500).json({
            error: 'Failed to fetch bidders',
            message: error.message
        });
    }
});
// GET /admin/dashboard - Get stats
router.get('/dashboard', async (_req, res) => {
    try {
        const { data: auctions, error: auctionsError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('status');
        if (auctionsError)
            throw auctionsError;
        const totalAuctions = auctions?.length || 0;
        const liveAuctions = auctions?.filter((a) => a.status === 'live').length || 0;
        const draftAuctions = auctions?.filter((a) => a.status === 'draft').length || 0;
        const endedAuctions = auctions?.filter((a) => a.status === 'ended').length || 0;
        const { count: totalBidders, error: biddersError } = await supabase_1.supabaseAdmin
            .from('bidders')
            .select('id', { count: 'exact', head: true });
        if (biddersError)
            throw biddersError;
        const { count: totalBids, error: bidsError } = await supabase_1.supabaseAdmin
            .from('bids')
            .select('id', { count: 'exact', head: true });
        if (bidsError)
            throw bidsError;
        const { count: recentWinners, error: winnersError } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id', { count: 'exact', head: true });
        if (winnersError)
            throw winnersError;
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
        });
    }
    catch (error) {
        console.error('Dashboard API error:', error);
        return res.status(500).json({
            error: 'Failed to fetch dashboard stats',
            message: error.message
        });
    }
});
// POST /admin/upload-url - Supabase signed upload
router.post('/upload-url', async (req, res) => {
    try {
        const { filename, type, folder } = req.body || {};
        if (!filename || !type) {
            return res.status(400).json({ error: 'Filename and type required' });
        }
        const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media';
        const extension = filename.split('.').pop() || 'bin';
        const timestamp = Date.now();
        const cleanFolder = folder ? String(folder).replace(/[^a-z0-9]/gi, '') : 'uploads';
        const path = `${cleanFolder}/${timestamp}-${crypto_1.default.randomUUID()}.${extension}`;
        const { data, error } = await supabase_1.supabaseAdmin
            .storage
            .from(bucket)
            .createSignedUploadUrl(path);
        if (error) {
            console.error('Signed URL creation failed:', error);
            return res.status(500).json({ error: error.message });
        }
        const { data: publicData } = supabase_1.supabaseAdmin.storage.from(bucket).getPublicUrl(path);
        return res.json({
            signedUrl: data.signedUrl,
            path: data.path,
            publicUrl: publicData.publicUrl
        });
    }
    catch (error) {
        console.error('Upload URL error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /admin/winners - List winners
router.get('/winners', async (_req, res) => {
    try {
        const { data: winners, error } = await supabase_1.supabaseAdmin
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
        delhivery_awb,
        delhivery_order_id,
        delhivery_tracking_url,
        delhivery_status,
        delhivery_error,
        delhivery_raw_response,
        delhivery_last_tracking_update,
        shipment_triggered_at,
        escalation_done,
        bidder:bidder_id(name, phone, email),
        auction:auction_id(title, product_id, bidding_start_time, bidding_end_time)
      `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        // Normalize bidder/auction: Supabase may return relations as arrays or objects
        const normalizedWinners = (winners || []).map((w) => {
            const bidder = Array.isArray(w.bidder) ? w.bidder[0] : w.bidder;
            const auction = Array.isArray(w.auction) ? w.auction[0] : w.auction;
            return {
                ...w,
                bidder: bidder ?? { name: 'Unknown', phone: '', email: '' },
                auction: auction ?? { title: 'Unknown', product_id: '', bidding_start_time: null, bidding_end_time: null }
            };
        });
        return res.json({
            success: true,
            winners: normalizedWinners
        });
    }
    catch (error) {
        console.error('Winners API error:', error);
        return res.status(500).json({
            error: 'Failed to fetch winners',
            message: error.message
        });
    }
});
// PATCH /admin/winners/:id - Update winner
router.patch('/winners/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body || {};
        const { payment_status, dispatched_at } = body;
        const dispatchRequested = dispatched_at === true || dispatched_at === 'true';
        const updates = {};
        const { data: currentWinner, error: winnerFetchError } = await supabase_1.supabaseAdmin
            .from('winners')
            .select(`
        id,
        auction_id,
        bidder_id,
        payment_status,
        shipping_address,
        razorpay_order_id,
        dispatched_at,
        delhivery_awb,
        delhivery_order_id,
        delhivery_status,
        delhivery_tracking_url,
        auction:auction_id(title)
      `)
            .eq('id', id)
            .single();
        if (winnerFetchError || !currentWinner) {
            return res.status(404).json({ error: 'Winner not found' });
        }
        const cw = currentWinner;
        const auctionRecord = Array.isArray(cw.auction) ? cw.auction[0] : cw.auction;
        if (payment_status === 'completed') {
            updates.payment_status = 'completed';
            updates.payment_completed_at = new Date().toISOString();
            updates.payment_verified_by_admin = true;
        }
        if (dispatchRequested) {
            const effectivePaymentStatus = payment_status === 'completed' ? 'completed' : cw.payment_status;
            if (effectivePaymentStatus !== 'completed') {
                return res.status(400).json({ error: 'Dispatch requires completed payment status.' });
            }
            if (cw.delhivery_awb) {
                return res.status(200).json({
                    success: true,
                    winner: currentWinner,
                    message: 'Already dispatched'
                });
            }
            if (cw.delhivery_status === 'processing') {
                return res.status(409).json({ error: 'Dispatch is already in progress for this winner.' });
            }
            const normalizedShipping = normalizeShippingAddress(cw.shipping_address);
            if (!normalizedShipping.address) {
                return res.status(400).json({ error: normalizedShipping.error || 'Shipping address is required before dispatch.' });
            }
            const orderId = cw.delhivery_order_id || cw.razorpay_order_id || `WIN-${cw.id}`;
            const { data: existingByOrder } = await supabase_1.supabaseAdmin
                .from('winners')
                .select('id, delhivery_awb, delhivery_tracking_url, dispatched_at')
                .eq('delhivery_order_id', orderId)
                .not('delhivery_awb', 'is', null)
                .maybeSingle();
            if (existingByOrder?.delhivery_awb) {
                return res.status(200).json({
                    success: true,
                    winner: {
                        ...currentWinner,
                        delhivery_order_id: orderId,
                        delhivery_awb: existingByOrder.delhivery_awb,
                        delhivery_tracking_url: existingByOrder.delhivery_tracking_url,
                        dispatched_at: existingByOrder.dispatched_at
                    },
                    message: 'Already dispatched'
                });
            }
            if (!env_1.env.delhiveryEnabled) {
                updates.dispatched_at = new Date().toISOString();
                updates.delhivery_order_id = orderId;
                updates.delhivery_status = 'created';
                updates.delhivery_last_tracking_update = new Date().toISOString();
                updates.delhivery_error = null;
                updates.shipment_triggered_at = null;
                updates.delhivery_raw_response = {
                    skipped: true,
                    reason: 'DELHIVERY_ENABLED is false',
                    timestamp: new Date().toISOString(),
                    orderId
                };
            }
            else {
                const { data: lockRow, error: lockError } = await supabase_1.supabaseAdmin
                    .from('winners')
                    .update({
                    delhivery_status: 'processing',
                    delhivery_order_id: orderId,
                    shipment_triggered_at: new Date().toISOString(),
                    delhivery_error: null
                })
                    .eq('id', id)
                    .is('delhivery_awb', null)
                    .or('delhivery_status.is.null,delhivery_status.neq.processing')
                    .select('id')
                    .maybeSingle();
                if (lockError) {
                    console.error('Dispatch lock update error:', lockError);
                    return res.status(500).json({ error: 'Failed to acquire dispatch lock' });
                }
                if (!lockRow) {
                    return res.status(409).json({ error: 'Dispatch is already in progress for this winner.' });
                }
                const shipment = await (0, delhivery_service_1.createDelhiveryShipment)(normalizedShipping.address, auctionRecord?.title || 'Auction Item', orderId, id);
                if (shipment.success && shipment.awb) {
                    updates.dispatched_at = new Date().toISOString();
                    updates.delhivery_awb = shipment.awb;
                    updates.delhivery_order_id = orderId;
                    updates.delhivery_tracking_url = shipment.trackingUrl || null;
                    updates.delhivery_status = 'created';
                    updates.delhivery_raw_response = shipment.rawResponse || null;
                    updates.delhivery_last_tracking_update = new Date().toISOString();
                    updates.shipment_triggered_at = new Date().toISOString();
                    updates.delhivery_error = null;
                }
                else {
                    const failureUpdates = {
                        ...updates,
                        dispatched_at: null,
                        delhivery_order_id: orderId,
                        delhivery_status: 'failed',
                        delhivery_error: shipment.error || 'Failed to create Delhivery shipment',
                        delhivery_raw_response: shipment.rawResponse || null,
                        delhivery_last_tracking_update: new Date().toISOString(),
                        shipment_triggered_at: new Date().toISOString()
                    };
                    const { data: failedWinner, error: failUpdateError } = await supabase_1.supabaseAdmin
                        .from('winners')
                        .update(failureUpdates)
                        .eq('id', id)
                        .select()
                        .single();
                    if (failUpdateError)
                        throw failUpdateError;
                    return res.status(502).json({
                        success: false,
                        error: shipment.error || 'Delhivery shipment creation failed. Retry dispatch.',
                        winner: failedWinner
                    });
                }
            }
        }
        else if (dispatched_at !== undefined) {
            updates.dispatched_at = dispatched_at || null;
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Provide payment_status and/or dispatched_at' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('winners')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        if (payment_status === 'completed' && data?.bidder_id) {
            const { data: bidder } = await supabase_1.supabaseAdmin.from('bidders').select('email, name').eq('id', data.bidder_id).single();
            const { data: auction } = await supabase_1.supabaseAdmin.from('auctions').select('title').eq('id', data.auction_id).single();
            if (bidder?.email) {
                await (0, email_service_1.sendPaymentConfirmedEmail)(bidder.email, bidder?.name || 'Winner', auction?.title || 'Auction');
            }
        }
        return res.json({ success: true, winner: data });
    }
    catch (error) {
        console.error('Patch winner error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to update winner' });
    }
});
// POST /admin/winners/:id/resend-email - Force resend winner notification email
router.post('/winners/:id/resend-email', async (req, res) => {
    try {
        const id = req.params.id;
        // Fetch the winner with bidder + auction info
        const { data: winner, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, claim_token, size, payment_due_at, payment_status')
            .eq('id', id)
            .single();
        if (fetchErr || !winner) {
            return res.status(404).json({ error: 'Winner not found' });
        }
        const w = winner;
        if (w.payment_status !== 'pending' && w.payment_status !== 'overdue') {
            return res.status(400).json({ error: `Cannot resend winner payment email for status: ${w.payment_status}` });
        }
        // Ensure claim_token exists (backfill if missing)
        let claimToken = w.claim_token;
        if (!claimToken) {
            claimToken = crypto_1.default.randomUUID();
            await supabase_1.supabaseAdmin.from('winners').update({
                claim_token: claimToken,
                payment_status: w.payment_status || 'pending',
                payment_due_at: null
            }).eq('id', id);
        }
        const { data: auction } = await supabase_1.supabaseAdmin.from('auctions').select('title').eq('id', w.auction_id).single();
        const { data: bidder } = await supabase_1.supabaseAdmin.from('bidders').select('name, email').eq('id', w.bidder_id).single();
        if (!bidder?.email) {
            return res.status(400).json({ error: 'Bidder has no email address registered' });
        }
        if ((0, winner_offer_service_1.isWinnerPaymentExpired)(w)) {
            await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: null }).eq('id', id);
        }
        // Reset winner_email_sent_at so it's queryable as unsent
        await supabase_1.supabaseAdmin.from('winners').update({ winner_email_sent_at: null }).eq('id', id);
        // Send the email
        const emailSent = await (0, email_service_1.sendWinnerEmail)({
            to: bidder.email,
            winnerName: bidder?.name || 'Winner',
            auctionTitle: auction?.title || 'Auction',
            winningAmount: Number(w.winning_amount),
            claimToken,
            size: w.size,
            isEscalation: false
        });
        if (!emailSent) {
            const detail = (0, email_service_2.getLastWinnerEmailError)();
            return res.status(500).json({
                error: 'Email service failed. Check RESEND_API_KEY and domain verification in Resend dashboard.',
                details: detail || 'Unknown email provider failure'
            });
        }
        // Mark as sent
        await supabase_1.supabaseAdmin.from('winners').update((0, winner_offer_service_1.buildWinnerNotificationUpdate)()).eq('id', id);
        return res.json({ ok: true, message: `Email sent to ${bidder.email}` });
    }
    catch (error) {
        console.error('Resend email error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to resend email' });
    }
});
// POST /admin/trigger-winner-emails - Manually trigger winner email notifications
router.post('/trigger-winner-emails', async (_req, res) => {
    try {
        const now = new Date().toISOString();
        // Finalize ended auctions to ensure winners exist
        await (0, auction_service_1.finalizeEndedAuctions)();
        // ── STEP 1: Backfill winners missing claim_token / payment_status ────────────
        // This covers winners created by the old PUT /admin/auctions/:id route that
        // didn't set those fields, and any existing winners in the DB before this fix.
        const { data: incompleteWinners, error: incompleteErr } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, payment_status, claim_token, payment_due_at')
            .or('claim_token.is.null,payment_status.is.null');
        console.log(`[trigger-winner-emails] Step1: incompleteWinners=${incompleteWinners?.length ?? 0}, err=${incompleteErr?.message}`);
        if (incompleteWinners && incompleteWinners.length > 0) {
            for (const iw of incompleteWinners) {
                const patch = {};
                if (!iw.claim_token) {
                    patch.claim_token = crypto_1.default.randomUUID();
                }
                if (!iw.payment_status) {
                    patch.payment_status = 'pending';
                }
                if (!iw.payment_due_at) {
                    patch.payment_due_at = null;
                }
                if (Object.keys(patch).length > 0) {
                    console.log(`[trigger-winner-emails] Patching winner ${iw.id} with:`, patch);
                    const { error: patchErr } = await supabase_1.supabaseAdmin.from('winners').update(patch).eq('id', iw.id);
                    if (patchErr)
                        console.error(`[trigger-winner-emails] Patch error for ${iw.id}:`, patchErr.message);
                }
            }
        }
        // ── STEP 2: Find all winners still pending email notification ─────────────────
        const { data: toNotify, error: fetchError } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, claim_token, size, payment_status, winner_email_sent_at')
            .eq('payment_status', 'pending')
            .not('claim_token', 'is', null)
            .is('winner_email_sent_at', null);
        console.log(`[trigger-winner-emails] Step2: toNotify=${toNotify?.length ?? 0}, fetchError=${fetchError?.message}`);
        if (fetchError) {
            return res.status(500).json({ error: 'Failed to fetch winners', details: fetchError.message });
        }
        if (!toNotify || toNotify.length === 0) {
            // Also fetch ALL winners to show debug info
            const { data: allWinners } = await supabase_1.supabaseAdmin
                .from('winners')
                .select('id, payment_status, claim_token, winner_email_sent_at, bidder_id');
            console.log('[trigger-winner-emails] All winners in DB:', JSON.stringify(allWinners, null, 2));
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
            });
        }
        let sent = 0;
        let failed = 0;
        const errors = [];
        for (const w of toNotify) {
            try {
                const { data: auction } = await supabase_1.supabaseAdmin
                    .from('auctions')
                    .select('title')
                    .eq('id', w.auction_id)
                    .single();
                const { data: bidder } = await supabase_1.supabaseAdmin
                    .from('bidders')
                    .select('name, email')
                    .eq('id', w.bidder_id)
                    .single();
                console.log(`[trigger-winner-emails] Winner ${w.id}: bidder email=${bidder?.email}, has claim_token=${!!w.claim_token}`);
                if (!bidder?.email || !w.claim_token) {
                    const reason = !bidder?.email ? 'bidder has no email address' : 'missing claim_token';
                    errors.push(`Winner ${w.id}: ${reason}`);
                    console.warn(`[trigger-winner-emails] Skipping winner ${w.id}: ${reason}`);
                    failed++;
                    continue;
                }
                const emailSent = await (0, email_service_1.sendWinnerEmail)({
                    to: bidder.email,
                    winnerName: bidder?.name || 'Winner',
                    auctionTitle: auction?.title || 'Auction',
                    winningAmount: Number(w.winning_amount),
                    claimToken: w.claim_token,
                    size: w.size,
                    isEscalation: false
                });
                console.log(`[trigger-winner-emails] Email send result for winner ${w.id}: ${emailSent}`);
                if (emailSent) {
                    const sentAt = new Date().toISOString();
                    await supabase_1.supabaseAdmin
                        .from('winners')
                        .update((0, winner_offer_service_1.buildWinnerNotificationUpdate)(sentAt))
                        .eq('id', w.id);
                    sent++;
                }
                else {
                    const detail = (0, email_service_2.getLastWinnerEmailError)();
                    errors.push(`Winner ${w.id}: Resend API call failed (check RESEND_API_KEY and domain verification). ${detail || ''}`.trim());
                    failed++;
                }
            }
            catch (err) {
                errors.push(`Winner ${w.id}: ${err.message}`);
                failed++;
                console.error(`[trigger-winner-emails] Exception for winner ${w.id}:`, err);
            }
        }
        return res.json({
            success: true,
            sent,
            failed,
            total: toNotify.length,
            errors: errors.length > 0 ? errors : undefined
        });
    }
    catch (error) {
        console.error('Trigger winner emails error:', error);
        return res.status(500).json({ error: 'Failed to trigger emails', details: error.message });
    }
});
// GET /admin/settings/admin-emails - Get all admin emails
router.get('/settings/admin-emails', async (_req, res) => {
    try {
        // Get from database
        const { data: setting, error } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .select('value')
            .eq('key', 'admin_emails')
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching admin emails:', error);
            return res.status(500).json({ error: 'Failed to fetch admin emails' });
        }
        const dbEmails = setting?.value || [];
        // Also return env emails for reference
        const envEmails = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);
        return res.json({
            success: true,
            adminEmails: Array.isArray(dbEmails) ? dbEmails : [],
            envEmails: envEmails,
            source: 'database'
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /admin/settings/admin-emails - Add an admin email
router.post('/settings/admin-emails', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email is required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        // Get current admin emails
        const { data: setting, error: fetchError } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .select('value')
            .eq('key', 'admin_emails')
            .single();
        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching admin emails:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch current admin emails' });
        }
        const currentEmails = Array.isArray(setting?.value) ? setting.value : [];
        // Check if email already exists
        if (currentEmails.includes(normalizedEmail)) {
            return res.status(400).json({ error: 'Email already exists in admin list' });
        }
        // Add new email
        const updatedEmails = [...currentEmails, normalizedEmail];
        // Upsert the setting
        const { error: upsertError } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .upsert({
            key: 'admin_emails',
            value: updatedEmails,
            updated_at: new Date().toISOString(),
            updated_by: normalizedEmail
        }, {
            onConflict: 'key'
        });
        if (upsertError) {
            console.error('Error upserting admin email:', upsertError);
            return res.status(500).json({ error: 'Failed to add admin email' });
        }
        return res.json({
            success: true,
            message: 'Admin email added successfully',
            adminEmails: updatedEmails
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /admin/settings/admin-emails - Remove an admin email
router.delete('/settings/admin-emails', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email is required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Get current admin emails
        const { data: setting, error: fetchError } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .select('value')
            .eq('key', 'admin_emails')
            .single();
        if (fetchError) {
            console.error('Error fetching admin emails:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch current admin emails' });
        }
        const currentEmails = Array.isArray(setting?.value) ? setting.value : [];
        // Check if email exists
        if (!currentEmails.includes(normalizedEmail)) {
            return res.status(404).json({ error: 'Email not found in admin list' });
        }
        // Prevent removing the last admin
        if (currentEmails.length === 1) {
            return res.status(400).json({ error: 'Cannot remove the last admin email' });
        }
        // Remove email
        const updatedEmails = currentEmails.filter((e) => e !== normalizedEmail);
        // Update the setting
        const { error: updateError } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .update({
            value: updatedEmails,
            updated_at: new Date().toISOString()
        })
            .eq('key', 'admin_emails');
        if (updateError) {
            console.error('Error updating admin emails:', updateError);
            return res.status(500).json({ error: 'Failed to remove admin email' });
        }
        return res.json({
            success: true,
            message: 'Admin email removed successfully',
            adminEmails: updatedEmails
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
