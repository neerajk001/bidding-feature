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
const verifiedBuckets = new Set();
const DEFAULT_REEL_MAX_MB = 80;
const ADMIN_TRIGGER_MAX_LOOKBACK_DAYS = 365;
function parseBooleanFlag(value, fallback = false) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value !== 'string')
        return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function parseBatchLimit(rawValue, defaultValue) {
    const parsed = Number(rawValue);
    const base = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
    return Math.min(base, env_1.env.adminManualWorkflowMaxBatch);
}
function parseLookbackDays(rawValue, fallback = 30) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.floor(parsed), ADMIN_TRIGGER_MAX_LOOKBACK_DAYS);
}
function enforceManualWorkflowAccess(res) {
    if (process.env.NODE_ENV !== 'production')
        return true;
    if (env_1.env.adminManualWorkflowsEnabled)
        return true;
    res.status(403).json({ error: 'Manual admin workflows are disabled in production.' });
    return false;
}
function parseTimestamp(value) {
    if (!value)
        return Number.NaN;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NaN : ts;
}
function cleanText(value) {
    return String(value ?? '').trim();
}
function isDataUri(value) {
    return /^data:[^;]+;base64,/i.test(value);
}
function sanitizeMediaUrl(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (isDataUri(trimmed))
        return null;
    return trimmed;
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
function buildMockAwb(seed) {
    const base = String(seed || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-8) || 'LOCAL';
    const stamp = Date.now().toString().slice(-8);
    return `MOCK${stamp}${base}`;
}
// Custom upload middleware for admin routes (handles any fieldname)
function maybeUpload(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (typeof contentType === 'string' && contentType.includes('multipart/form-data')) {
        return upload.any()(req, res, next);
    }
    return next();
}
function getConfiguredReelMaxMb() {
    const parsed = Number(process.env.AUCTION_MAX_REEL_MB || DEFAULT_REEL_MAX_MB);
    if (!Number.isFinite(parsed))
        return DEFAULT_REEL_MAX_MB;
    return Math.min(Math.max(Math.floor(parsed), 10), 500);
}
async function ensureStorageBucket(bucket, maxReelMb) {
    if (verifiedBuckets.has(bucket))
        return;
    const { data: buckets, error: listError } = await supabase_1.supabaseAdmin.storage.listBuckets();
    if (listError) {
        throw new Error(`Storage bucket listing failed: ${listError.message}`);
    }
    const existing = (buckets || []).find((b) => String(b?.name || b?.id || '') === bucket);
    if (existing) {
        verifiedBuckets.add(bucket);
        return;
    }
    const fileSizeLimitBytes = maxReelMb * 1024 * 1024;
    let { error: createError } = await supabase_1.supabaseAdmin.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: fileSizeLimitBytes
    });
    if (createError) {
        const msg = String(createError.message || '').toLowerCase();
        const alreadyExists = msg.includes('already exists') || msg.includes('duplicate') || msg.includes('conflict');
        const limitNotAccepted = msg.includes('maximum allowed size') || msg.includes('file size');
        if (!alreadyExists && limitNotAccepted) {
            // Some projects reject custom bucket size limits.
            // Retry with platform default limit instead of failing hard.
            const retry = await supabase_1.supabaseAdmin.storage.createBucket(bucket, { public: true });
            createError = retry.error || null;
        }
        if (createError && !alreadyExists) {
            throw new Error(`Storage bucket "${bucket}" missing and auto-create failed: ${createError.message}`);
        }
    }
    verifiedBuckets.add(bucket);
}
// Protect all admin routes
router.use(auth_1.requireAdmin);
// GET /admin/auctions - List all auctions
router.get('/auctions', async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const { data: auctions, error, count } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, min_increment, base_price, registration_end_time, bidding_start_time, bidding_end_time, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch auctions' });
        }
        return res.json({
            auctions: auctions || [],
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: Array.isArray(auctions) ? auctions.length === limit : false
            }
        });
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
        const MAX_REEL_MB = getConfiguredReelMaxMb();
        const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media';
        await ensureStorageBucket(bucket, MAX_REEL_MB);
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
                        const cleaned = sanitizeMediaUrl(url);
                        if (cleaned) {
                            galleryUrls.push(cleaned);
                        }
                    });
                }
                else if (typeof passedGalleryUrls === 'string' && passedGalleryUrls.trim() !== '') {
                    const cleaned = sanitizeMediaUrl(passedGalleryUrls);
                    if (cleaned) {
                        galleryUrls.push(cleaned);
                    }
                }
            }
        }
        else {
            body = (req.body || {});
            const passedGalleryUrls = body.gallery_urls;
            if (passedGalleryUrls) {
                if (Array.isArray(passedGalleryUrls)) {
                    for (const url of passedGalleryUrls) {
                        const cleaned = sanitizeMediaUrl(url);
                        if (cleaned)
                            galleryUrls.push(cleaned);
                    }
                }
                else if (typeof passedGalleryUrls === 'string') {
                    const cleaned = sanitizeMediaUrl(passedGalleryUrls);
                    if (cleaned)
                        galleryUrls.push(cleaned);
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
        const normalizedBannerImage = sanitizeMediaUrl(banner_image);
        if (typeof banner_image === 'string' && banner_image.trim() !== '' && !normalizedBannerImage) {
            return res.status(400).json({ error: 'banner_image must be a public URL, not base64 data.' });
        }
        let reelPublicUrl = sanitizeMediaUrl(reel_url);
        if (typeof reel_url === 'string' && reel_url.trim() !== '' && !reelPublicUrl) {
            return res.status(400).json({ error: 'reel_url must be a public URL, not base64 data.' });
        }
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
            banner_image: normalizedBannerImage,
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
function parsePageAndLimit(req, defaultLimit = 50, maxLimit = 200) {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(maxLimit, Math.max(10, Number(req.query.limit || defaultLimit)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    return { page, limit, from, to };
}
// GET /admin/auction/:id - Get basic auction details only
router.get('/auction/:id', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { data: auction, error: auctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, min_increment, registration_end_time, bidding_start_time, bidding_end_time, available_sizes')
            .eq('id', auctionId)
            .single();
        if (auctionError || !auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const [{ count: totalBids }, { count: totalBidders }, { count: totalWinners }, { data: highestBidRow }] = await Promise.all([
            supabase_1.supabaseAdmin.from('bids').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin.from('bidders').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin.from('winners').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin
                .from('bids')
                .select('amount')
                .eq('auction_id', auctionId)
                .order('amount', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);
        return res.json({
            auction,
            summary: {
                total_bids: totalBids || 0,
                total_bidders: totalBidders || 0,
                total_winners: totalWinners || 0,
                current_highest_bid: highestBidRow?.amount ?? null
            }
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /admin/auction/:id/bids - Get paginated bids
router.get('/auction/:id/bids', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { page, limit, from, to } = parsePageAndLimit(req, 100, 200);
        const [{ data: bids, error: bidsError, count }, { data: highestBidRow }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('bids')
                .select(`
          id,
          amount,
          created_at,
          bidder_id,
          size,
          bidders!fk_bids_bidder (
            name,
            phone,
            email
          )
        `, { count: 'exact' })
                .eq('auction_id', auctionId)
                .order('amount', { ascending: false })
                .order('created_at', { ascending: true })
                .range(from, to),
            supabase_1.supabaseAdmin
                .from('bids')
                .select('amount')
                .eq('auction_id', auctionId)
                .order('amount', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);
        if (bidsError) {
            console.error('Error fetching bids:', bidsError);
            return res.status(500).json({ error: 'Failed to fetch bids' });
        }
        return res.json({
            bids: bids || [],
            current_highest_bid: highestBidRow?.amount ?? null,
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: from + (bids?.length || 0) < (count ?? 0)
            }
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /admin/auction/:id/bidders - Get paginated bidders
router.get('/auction/:id/bidders', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { page, limit, from, to } = parsePageAndLimit(req, 100, 200);
        const { data: bidders, error: biddersError, count } = await supabase_1.supabaseAdmin
            .from('bidders')
            .select('id, name, phone, email, created_at', { count: 'exact' })
            .eq('auction_id', auctionId)
            .order('created_at', { ascending: false })
            .range(from, to);
        if (biddersError) {
            console.error('Error fetching bidders:', biddersError);
            return res.status(500).json({ error: 'Failed to fetch bidders' });
        }
        const bidderIds = (bidders || []).map((bidder) => bidder.id);
        const highestByBidder = new Map();
        if (bidderIds.length > 0) {
            const { data: bidsForPageBidders } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('bidder_id, amount')
                .eq('auction_id', auctionId)
                .in('bidder_id', bidderIds);
            for (const row of bidsForPageBidders || []) {
                const bidderId = String(row.bidder_id || '');
                const amount = Number(row.amount || 0);
                const current = highestByBidder.get(bidderId);
                if (current === undefined || amount > current) {
                    highestByBidder.set(bidderId, amount);
                }
            }
        }
        const biddersWithHighestBid = (bidders || []).map((bidder) => ({
            ...bidder,
            highest_bid: highestByBidder.has(String(bidder.id)) ? highestByBidder.get(String(bidder.id)) ?? null : null
        }));
        return res.json({
            bidders: biddersWithHighestBid,
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: from + biddersWithHighestBid.length < (count ?? 0)
            }
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /admin/auction/:id/winners - Get paginated winners
router.get('/auction/:id/winners', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { page, limit, from, to } = parsePageAndLimit(req, 50, 200);
        const { data: winnersRows, error: winnersError, count } = await supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, size, declared_at, bidder:bidder_id(name, phone, email)', { count: 'exact' })
            .eq('auction_id', auctionId)
            .order('declared_at', { ascending: false })
            .range(from, to);
        if (winnersError) {
            console.error('Error fetching winners:', winnersError);
            return res.status(500).json({ error: 'Failed to fetch winners' });
        }
        const winners = (winnersRows || []).map((w) => {
            const bidder = w.bidder;
            const name = Array.isArray(bidder) ? bidder[0]?.name : bidder?.name ?? null;
            const phone = Array.isArray(bidder) ? bidder[0]?.phone : bidder?.phone ?? null;
            const email = Array.isArray(bidder) ? bidder[0]?.email : bidder?.email ?? null;
            return {
                id: w.id,
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
            winners,
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: from + winners.length < (count ?? 0)
            }
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Backward-compatible alias for older clients.
router.get('/auctions/:id', async (req, res) => {
    try {
        const auctionId = req.params.id;
        const { data: auction, error: auctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, min_increment, registration_end_time, bidding_start_time, bidding_end_time, available_sizes')
            .eq('id', auctionId)
            .single();
        if (auctionError || !auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const [{ count: totalBids }, { count: totalBidders }, { count: totalWinners }, { data: highestBidRow }] = await Promise.all([
            supabase_1.supabaseAdmin.from('bids').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin.from('bidders').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin.from('winners').select('id', { count: 'exact', head: true }).eq('auction_id', auctionId),
            supabase_1.supabaseAdmin
                .from('bids')
                .select('amount')
                .eq('auction_id', auctionId)
                .order('amount', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);
        return res.json({
            auction,
            summary: {
                total_bids: totalBids || 0,
                total_bidders: totalBidders || 0,
                total_winners: totalWinners || 0,
                current_highest_bid: highestBidRow?.amount ?? null
            }
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
router.get('/bidders', async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const { data: bidders, error: biddersError, count } = await supabase_1.supabaseAdmin
            .from('bidders')
            .select(`
        id,
        name,
        phone,
        email,
        auction_id,
        created_at,
        auction:auctions(title, product_id, status)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        if (biddersError)
            throw biddersError;
        const bidderIds = Array.from(new Set((bidders || []).map((b) => String(b.id || '')).filter(Boolean)));
        const statsMap = new Map();
        if (bidderIds.length > 0) {
            const { data: bidRows } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('bidder_id, amount')
                .in('bidder_id', bidderIds);
            for (const row of bidRows || []) {
                const bidderId = String(row.bidder_id || '');
                if (!bidderId)
                    continue;
                const amount = Number(row.amount || 0);
                const current = statsMap.get(bidderId) || { bids_count: 0, highest_bid: null };
                current.bids_count += 1;
                if (current.highest_bid === null || amount > current.highest_bid) {
                    current.highest_bid = amount;
                }
                statsMap.set(bidderId, current);
            }
        }
        const biddersWithStats = (bidders || []).map((bidder) => {
            const stats = statsMap.get(String(bidder.id)) || { bids_count: 0, highest_bid: null };
            return {
                ...bidder,
                registered_at: bidder.created_at,
                bids_count: stats.bids_count,
                highest_bid: stats.highest_bid
            };
        });
        return res.json({
            success: true,
            bidders: biddersWithStats,
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: from + biddersWithStats.length < (count ?? 0)
            }
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
        await ensureStorageBucket(bucket, getConfiguredReelMaxMb());
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
            const hint = /bucket|not found|storage/i.test(String(error.message || ''))
                ? `Check bucket "${bucket}" exists and backend uses SUPABASE_SERVICE_ROLE_KEY.`
                : 'Check Supabase Storage configuration.';
            return res.status(500).json({ error: `${error.message}. ${hint}` });
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
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({
            error: `Upload URL generation failed. ${details}`,
            hint: 'Verify SUPABASE_SERVICE_ROLE_KEY, Storage API availability, and bucket permissions.'
        });
    }
});
// GET /admin/winners - List winners
router.get('/winners', async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const { data: winners, error, count } = await supabase_1.supabaseAdmin
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
        delhivery_last_tracking_update,
        shipment_triggered_at,
        escalation_done,
        bidder:bidder_id(name, phone, email),
        auction:auction_id(title, product_id, bidding_start_time, bidding_end_time)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
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
            winners: normalizedWinners,
            pagination: {
                page,
                limit,
                total: count ?? 0,
                has_more: from + normalizedWinners.length < (count ?? 0)
            }
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
                const mockAwb = env_1.env.delhiveryMockAwbWhenDisabled ? buildMockAwb(`${id}${orderId}`) : null;
                updates.dispatched_at = new Date().toISOString();
                updates.delhivery_order_id = orderId;
                updates.delhivery_awb = mockAwb;
                updates.delhivery_tracking_url = mockAwb ? `https://www.delhivery.com/track/package/${mockAwb}` : null;
                updates.delhivery_status = 'created';
                updates.delhivery_last_tracking_update = new Date().toISOString();
                updates.delhivery_error = null;
                updates.shipment_triggered_at = null;
                updates.delhivery_raw_response = {
                    skipped: true,
                    reason: 'DELHIVERY_ENABLED is false',
                    mock_awb_generated: Boolean(mockAwb),
                    mock_awb: mockAwb,
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
        if (dispatchRequested && data?.delhivery_awb && data?.bidder_id) {
            const { data: bidder } = await supabase_1.supabaseAdmin
                .from('bidders')
                .select('email, name')
                .eq('id', data.bidder_id)
                .single();
            const { data: auction } = await supabase_1.supabaseAdmin
                .from('auctions')
                .select('title')
                .eq('id', data.auction_id)
                .single();
            if (bidder?.email) {
                await (0, email_service_1.sendShipmentDispatchedEmail)({
                    to: bidder.email,
                    winnerName: bidder?.name || 'Winner',
                    auctionTitle: auction?.title || 'Auction',
                    awb: data?.delhivery_awb || null,
                    trackingUrl: data?.delhivery_tracking_url || null
                });
            }
        }
        return res.json({ success: true, winner: data });
    }
    catch (error) {
        console.error('Patch winner error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to update winner' });
    }
});
// POST /admin/winners/retry-failed-shipments - Retry failed Delhivery shipment creations in bulk
router.post('/winners/retry-failed-shipments', async (req, res) => {
    try {
        if (!enforceManualWorkflowAccess(res))
            return;
        const body = req.body || {};
        const winnerIds = Array.isArray(body.winner_ids)
            ? body.winner_ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        const limit = parseBatchLimit(body.limit, 25);
        const lookbackDays = parseLookbackDays(body.lookback_days, 30);
        const lookbackIso = new Date(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000)).toISOString();
        let query = supabase_1.supabaseAdmin
            .from('winners')
            .select(`
        id,
        payment_status,
        shipping_address,
        razorpay_order_id,
        delhivery_order_id,
        delhivery_status,
        delhivery_awb,
        auction:auction_id(title)
      `)
            .eq('payment_status', 'completed')
            .is('delhivery_awb', null)
            .eq('delhivery_status', 'failed')
            .gte('created_at', lookbackIso)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (winnerIds.length > 0) {
            query = query.in('id', winnerIds);
        }
        const { data: failedWinners, error: failedFetchError } = await query;
        if (failedFetchError)
            throw failedFetchError;
        if (!failedWinners || failedWinners.length === 0) {
            return res.json({
                success: true,
                message: 'No failed shipments found to retry',
                total: 0,
                retried: 0,
                failed: 0,
                skipped: 0,
                results: []
            });
        }
        const results = [];
        for (const winnerRow of failedWinners) {
            const winner = winnerRow;
            const auctionRecord = Array.isArray(winner.auction) ? winner.auction[0] : winner.auction;
            const orderId = winner.delhivery_order_id || winner.razorpay_order_id || `WIN-${winner.id}`;
            if (winner.delhivery_awb) {
                results.push({ id: winner.id, status: 'skipped', reason: 'Already dispatched' });
                continue;
            }
            const normalizedShipping = normalizeShippingAddress(winner.shipping_address);
            if (!normalizedShipping.address) {
                await supabase_1.supabaseAdmin
                    .from('winners')
                    .update({
                    delhivery_status: 'failed',
                    delhivery_error: normalizedShipping.error || 'Shipping address is required before dispatch.',
                    delhivery_last_tracking_update: new Date().toISOString(),
                    delhivery_order_id: orderId
                })
                    .eq('id', winner.id);
                results.push({
                    id: winner.id,
                    status: 'failed',
                    reason: normalizedShipping.error || 'Invalid shipping address'
                });
                continue;
            }
            if (!env_1.env.delhiveryEnabled) {
                const mockAwb = env_1.env.delhiveryMockAwbWhenDisabled ? buildMockAwb(`${winner.id}${orderId}`) : null;
                await supabase_1.supabaseAdmin
                    .from('winners')
                    .update({
                    dispatched_at: new Date().toISOString(),
                    delhivery_order_id: orderId,
                    delhivery_awb: mockAwb,
                    delhivery_tracking_url: mockAwb ? `https://www.delhivery.com/track/package/${mockAwb}` : null,
                    delhivery_status: 'created',
                    delhivery_error: null,
                    delhivery_last_tracking_update: new Date().toISOString(),
                    delhivery_raw_response: {
                        skipped: true,
                        reason: 'DELHIVERY_ENABLED is false',
                        mock_awb_generated: Boolean(mockAwb),
                        mock_awb: mockAwb,
                        timestamp: new Date().toISOString(),
                        orderId
                    }
                })
                    .eq('id', winner.id);
                results.push({
                    id: winner.id,
                    status: 'skipped',
                    reason: 'Delhivery disabled, marked manual dispatch'
                });
                continue;
            }
            const { data: lockRow, error: lockError } = await supabase_1.supabaseAdmin
                .from('winners')
                .update({
                delhivery_status: 'processing',
                delhivery_order_id: orderId,
                shipment_triggered_at: new Date().toISOString(),
                delhivery_error: null
            })
                .eq('id', winner.id)
                .is('delhivery_awb', null)
                .or('delhivery_status.is.null,delhivery_status.eq.failed')
                .select('id')
                .maybeSingle();
            if (lockError) {
                results.push({ id: winner.id, status: 'failed', reason: 'Failed to acquire retry lock' });
                continue;
            }
            if (!lockRow) {
                results.push({ id: winner.id, status: 'skipped', reason: 'Dispatch already in progress' });
                continue;
            }
            const shipment = await (0, delhivery_service_1.createDelhiveryShipment)(normalizedShipping.address, auctionRecord?.title || 'Auction Item', orderId, winner.id);
            if (shipment.success && shipment.awb) {
                const { error: successUpdateError } = await supabase_1.supabaseAdmin
                    .from('winners')
                    .update({
                    dispatched_at: new Date().toISOString(),
                    delhivery_awb: shipment.awb,
                    delhivery_order_id: orderId,
                    delhivery_tracking_url: shipment.trackingUrl || null,
                    delhivery_status: 'created',
                    delhivery_raw_response: shipment.rawResponse || null,
                    delhivery_last_tracking_update: new Date().toISOString(),
                    shipment_triggered_at: new Date().toISOString(),
                    delhivery_error: null
                })
                    .eq('id', winner.id);
                if (successUpdateError) {
                    results.push({ id: winner.id, status: 'failed', reason: successUpdateError.message });
                }
                else {
                    results.push({ id: winner.id, status: 'created', awb: shipment.awb });
                }
            }
            else {
                await supabase_1.supabaseAdmin
                    .from('winners')
                    .update({
                    dispatched_at: null,
                    delhivery_order_id: orderId,
                    delhivery_status: 'failed',
                    delhivery_error: shipment.error || 'Failed to create Delhivery shipment',
                    delhivery_raw_response: shipment.rawResponse || null,
                    delhivery_last_tracking_update: new Date().toISOString(),
                    shipment_triggered_at: new Date().toISOString()
                })
                    .eq('id', winner.id);
                results.push({
                    id: winner.id,
                    status: 'failed',
                    reason: shipment.error || 'Delhivery shipment creation failed'
                });
            }
        }
        const retried = results.filter((r) => r.status === 'created').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const skipped = results.filter((r) => r.status === 'skipped').length;
        return res.json({
            success: failed === 0,
            message: `Processed ${results.length} failed shipment retries`,
            scope: {
                lookback_days: lookbackDays,
                max_batch: env_1.env.adminManualWorkflowMaxBatch
            },
            total: results.length,
            retried,
            failed,
            skipped,
            results
        });
    }
    catch (error) {
        console.error('Retry failed shipments error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to retry failed shipments' });
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
router.post('/trigger-winner-emails', async (req, res) => {
    try {
        if (!enforceManualWorkflowAccess(res))
            return;
        const body = req.body || {};
        const runFinalize = parseBooleanFlag(body.run_finalize, false);
        const runBackfill = parseBooleanFlag(body.run_backfill, false);
        const limit = parseBatchLimit(body.limit, 25);
        const lookbackDays = parseLookbackDays(body.lookback_days, 30);
        const lookbackIso = new Date(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000)).toISOString();
        const winnerIds = Array.isArray(body.winner_ids)
            ? body.winner_ids.map((id) => String(id || '').trim()).filter(Boolean).slice(0, env_1.env.adminManualWorkflowMaxBatch)
            : [];
        let finalizedAuctions = [];
        let finalizeErrors = [];
        if (runFinalize) {
            const finalizeResult = await (0, auction_service_1.finalizeEndedAuctions)();
            finalizedAuctions = finalizeResult.endedAuctionIds;
            finalizeErrors = finalizeResult.errors;
        }
        // Optional targeted backfill for legacy rows; always bounded by lookback+limit.
        if (runBackfill) {
            let incompleteQuery = supabase_1.supabaseAdmin
                .from('winners')
                .select('id, payment_status, claim_token, payment_due_at, created_at')
                .or('claim_token.is.null,payment_status.is.null')
                .gte('created_at', lookbackIso)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (winnerIds.length > 0) {
                incompleteQuery = incompleteQuery.in('id', winnerIds);
            }
            const { data: incompleteWinners, error: incompleteErr } = await incompleteQuery;
            if (incompleteErr) {
                return res.status(500).json({ error: 'Failed to backfill winners', details: incompleteErr.message });
            }
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
                        const { error: patchErr } = await supabase_1.supabaseAdmin.from('winners').update(patch).eq('id', iw.id);
                        if (patchErr)
                            console.error(`[trigger-winner-emails] Patch error for ${iw.id}:`, patchErr.message);
                    }
                }
            }
        }
        let toNotifyQuery = supabase_1.supabaseAdmin
            .from('winners')
            .select('id, auction_id, bidder_id, winning_amount, claim_token, size, payment_status, winner_email_sent_at, created_at')
            .eq('payment_status', 'pending')
            .not('claim_token', 'is', null)
            .is('winner_email_sent_at', null)
            .gte('created_at', lookbackIso)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (winnerIds.length > 0) {
            toNotifyQuery = toNotifyQuery.in('id', winnerIds);
        }
        const { data: toNotify, error: fetchError } = await toNotifyQuery;
        if (fetchError) {
            return res.status(500).json({ error: 'Failed to fetch winners', details: fetchError.message });
        }
        if (!toNotify || toNotify.length === 0) {
            return res.json({
                success: true,
                message: 'No winners pending notification',
                sent: 0,
                failed: 0,
                scope: {
                    run_finalize: runFinalize,
                    run_backfill: runBackfill,
                    lookback_days: lookbackDays,
                    max_batch: env_1.env.adminManualWorkflowMaxBatch,
                    winner_ids_count: winnerIds.length
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
                if (!bidder?.email || !w.claim_token) {
                    const reason = !bidder?.email ? 'bidder has no email address' : 'missing claim_token';
                    errors.push(`Winner ${w.id}: ${reason}`);
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
            scope: {
                run_finalize: runFinalize,
                run_backfill: runBackfill,
                lookback_days: lookbackDays,
                max_batch: env_1.env.adminManualWorkflowMaxBatch,
                winner_ids_count: winnerIds.length,
                finalized_auctions_count: finalizedAuctions.length
            },
            finalize_errors: finalizeErrors.length > 0 ? finalizeErrors : undefined,
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
