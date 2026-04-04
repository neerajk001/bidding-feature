"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../config/supabase");
const cache_1 = require("../middleware/cache");
const router = express_1.default.Router();
const liveStateCache = new Map();
function parseTimestamp(value) {
    if (!value)
        return Number.NaN;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NaN : ts;
}
function isWithinWindow(nowTs, start, end) {
    const startTs = parseTimestamp(start);
    const endTs = parseTimestamp(end);
    if (Number.isNaN(startTs) || Number.isNaN(endTs))
        return false;
    return nowTs >= startTs && nowTs <= endTs;
}
function getAuctionPhase(nowTs, start, end) {
    const startTs = parseTimestamp(start);
    const endTs = parseTimestamp(end);
    if (Number.isNaN(startTs) || Number.isNaN(endTs))
        return 'ended';
    if (nowTs < startTs)
        return 'upcoming';
    if (nowTs > endTs)
        return 'ended';
    return 'live';
}
// Public: List auctions
router.get('/auctions', async (req, res) => {
    try {
        const nowTs = Date.now();
        const includeEnded = req.query.includeEnded === 'true';
        const { data: auctions, error } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, gallery_images, min_increment, base_price, available_sizes')
            .neq('status', 'draft')
            .order('bidding_start_time', { ascending: true });
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch auctions' });
        }
        const auctionsWithBids = await Promise.all((auctions || []).map(async (auction) => {
            const derivedStatus = getAuctionPhase(nowTs, auction.bidding_start_time, auction.bidding_end_time);
            const { data: highestBid } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('amount, bidder:bidder_id(name)')
                .eq('auction_id', auction.id)
                .order('amount', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            const { count } = await supabase_1.supabaseAdmin
                .from('bids')
                .select('id', { count: 'exact', head: true })
                .eq('auction_id', auction.id);
            let winnersList = [];
            let winningAmount = null;
            let winnerName = null;
            let winnerDeclaredAt = null;
            if (derivedStatus === 'ended') {
                const { data: winnersRows } = await supabase_1.supabaseAdmin
                    .from('winners')
                    .select('size, winning_amount, declared_at, bidder:bidder_id(name)')
                    .eq('auction_id', auction.id);
                if (winnersRows && winnersRows.length > 0) {
                    winnersList = winnersRows.map((w) => {
                        const name = Array.isArray(w?.bidder) ? w.bidder[0]?.name : w?.bidder?.name ?? null;
                        return {
                            size: w.size ?? null,
                            winning_amount: Number(w.winning_amount) ?? 0,
                            winner_name: name,
                            declared_at: w.declared_at ?? null
                        };
                    });
                    const first = winnersList[0];
                    winningAmount = first?.winning_amount ?? null;
                    winnerName = first?.winner_name ?? null;
                    winnerDeclaredAt = first?.declared_at ?? null;
                }
            }
            const displayAmount = winningAmount ?? highestBid?.amount ?? null;
            const displayName = winnerName ?? (Array.isArray(highestBid?.bidder) ? highestBid.bidder[0]?.name : highestBid?.bidder?.name) ?? null;
            return {
                ...auction,
                status: derivedStatus,
                current_highest_bid: displayAmount,
                highest_bidder_name: displayName,
                total_bids: count ?? 0,
                winner_name: winnerName,
                winning_amount: winningAmount,
                winner_declared_at: winnerDeclaredAt,
                winners_by_size: winnersList
            };
        }));
        const filteredAuctions = includeEnded
            ? auctionsWithBids
            : auctionsWithBids.filter((auction) => auction.status !== 'ended');
        (0, cache_1.setNoCache)(res);
        return res.json({ success: true, auctions: filteredAuctions });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Public: Active auction
router.get('/auction/active', async (_req, res) => {
    try {
        const nowTs = Date.now();
        const { data: auctions, error } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, status, registration_end_time, bidding_start_time, bidding_end_time')
            .neq('status', 'draft')
            .order('bidding_start_time', { ascending: true });
        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch auctions' });
        }
        if (!auctions || auctions.length === 0) {
            (0, cache_1.setNoCache)(res);
            return res.json({ exists: false });
        }
        const liveAuction = auctions.find((auction) => isWithinWindow(nowTs, auction.bidding_start_time, auction.bidding_end_time));
        if (liveAuction) {
            (0, cache_1.setNoCache)(res);
            return res.json({
                exists: true,
                auction_id: liveAuction.id,
                phase: 'live',
                cta: 'Place Bid'
            });
        }
        const registrationAuction = auctions.find((auction) => {
            if (getAuctionPhase(nowTs, auction.bidding_start_time, auction.bidding_end_time) !== 'upcoming')
                return false;
            const startTs = parseTimestamp(auction.bidding_start_time);
            const regEndTs = parseTimestamp(auction.registration_end_time);
            if (Number.isNaN(startTs))
                return false;
            return nowTs < startTs && !Number.isNaN(regEndTs) && nowTs < regEndTs;
        });
        if (registrationAuction) {
            (0, cache_1.setNoCache)(res);
            return res.json({
                exists: true,
                auction_id: registrationAuction.id,
                phase: 'registration',
                cta: 'Register Now'
            });
        }
        (0, cache_1.setNoCache)(res);
        return res.json({ exists: false });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Public: Auction by product ID
router.get('/auction/product/:product_id', async (req, res) => {
    try {
        const product_id = req.params.product_id;
        if (!product_id) {
            return res.status(400).json({ error: 'Product ID is required' });
        }
        const { data: auction, error } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, min_increment')
            .eq('product_id', product_id)
            .single();
        if (error || !auction) {
            return res.status(404).json({ error: 'Auction not found for this product' });
        }
        const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time);
        if (derivedStatus !== 'live') {
            return res.status(404).json({ error: 'No live auction found for this product' });
        }
        const { data: highestBid } = await supabase_1.supabaseAdmin
            .from('bids')
            .select('amount, bidder:bidder_id(name)')
            .eq('auction_id', auction.id)
            .order('amount', { ascending: false })
            .limit(1)
            .maybeSingle();
        return res.json({
            ...auction,
            status: derivedStatus,
            current_highest_bid: highestBid?.amount ?? null,
            highest_bidder_name: Array.isArray(highestBid?.bidder) ? highestBid.bidder[0]?.name : highestBid?.bidder?.name ?? null
        });
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Public: Lightweight live-state refresh payload (used during active realtime bidding)
router.get('/auction/:id/live-state', async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ error: 'Auction ID is required' });
        }
        const now = Date.now();
        const cached = liveStateCache.get(id);
        if (cached && cached.expiresAt > now) {
            (0, cache_1.setNoCache)(res);
            return res.json(cached.payload);
        }
        const { data: auction, error: auctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, status, bidding_start_time, bidding_end_time')
            .eq('id', id)
            .single();
        if (auctionError || !auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time);
        const { data: snapshot, error: snapshotError } = await supabase_1.supabaseAdmin
            .rpc('get_auction_live_snapshot', { p_auction_id: id })
            .single();
        if (snapshotError) {
            console.error('Live snapshot RPC error:', snapshotError);
            return res.status(500).json({ error: 'Failed to fetch live auction snapshot' });
        }
        const payload = {
            id: auction.id,
            status: derivedStatus,
            bidding_end_time: auction.bidding_end_time,
            current_highest_bid: Number(snapshot?.current_highest_bid ?? 0),
            total_bids: Number(snapshot?.total_bids ?? 0),
            highest_bidder_name: snapshot?.highest_bidder_name ?? null,
            highest_bids_by_size: Array.isArray(snapshot?.highest_bids_by_size)
                ? snapshot.highest_bids_by_size
                : null
        };
        liveStateCache.set(id, { payload, expiresAt: now + 1500 });
        if (liveStateCache.size > 500) {
            for (const [key, entry] of liveStateCache.entries()) {
                if (entry.expiresAt <= now) {
                    liveStateCache.delete(key);
                }
            }
        }
        (0, cache_1.setNoCache)(res);
        return res.json(payload);
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// Public: Auction by ID (RPC)
router.get('/auction/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ error: 'Auction ID is required' });
        }
        // Direct query - no RPC needed
        const { data: auction, error: auctionError } = await supabase_1.supabaseAdmin
            .from('auctions')
            .select('id, title, product_id, status, registration_end_time, bidding_start_time, bidding_end_time, banner_image, reel_url, gallery_images, min_increment, base_price, available_sizes')
            .eq('id', id)
            .single();
        if (auctionError || !auction) {
            return res.status(404).json({ error: 'Auction not found' });
        }
        const derivedStatus = getAuctionPhase(Date.now(), auction.bidding_start_time, auction.bidding_end_time);
        const { data: snapshot, error: snapshotError } = await supabase_1.supabaseAdmin
            .rpc('get_auction_live_snapshot', { p_auction_id: id })
            .single();
        if (snapshotError) {
            console.error('Auction snapshot RPC error:', snapshotError);
            return res.status(500).json({ error: 'Failed to fetch auction snapshot' });
        }
        // Get winners if auction ended
        let winnersList = [];
        let winningAmount = null;
        let winnerName = null;
        let winnerDeclaredAt = null;
        if (derivedStatus === 'ended') {
            const { data: winnersRows } = await supabase_1.supabaseAdmin
                .from('winners')
                .select('size, winning_amount, declared_at, bidder:bidder_id(name)')
                .eq('auction_id', id);
            if (winnersRows && winnersRows.length > 0) {
                winnersList = winnersRows.map((w) => {
                    const name = Array.isArray(w?.bidder) ? w.bidder[0]?.name : w?.bidder?.name ?? null;
                    return {
                        size: w.size ?? null,
                        winning_amount: Number(w.winning_amount) ?? 0,
                        winner_name: name,
                        declared_at: w.declared_at ?? null
                    };
                });
                const first = winnersList[0];
                winningAmount = first?.winning_amount ?? null;
                winnerName = first?.winner_name ?? null;
                winnerDeclaredAt = first?.declared_at ?? null;
            }
        }
        // Display values
        const displayAmount = winningAmount ?? Number(snapshot?.current_highest_bid ?? 0);
        const displayName = winnerName ?? (snapshot?.highest_bidder_name ?? null);
        const highest_bids_by_size = Array.isArray(snapshot?.highest_bids_by_size)
            ? snapshot.highest_bids_by_size
            : null;
        const data = {
            ...auction,
            status: derivedStatus,
            current_highest_bid: displayAmount,
            highest_bidder_name: displayName,
            total_bids: Number(snapshot?.total_bids ?? 0),
            winner_name: winnerName,
            winning_amount: winningAmount,
            winner_declared_at: winnerDeclaredAt,
            winners_by_size: winnersList,
            highest_bids_by_size
        };
        (0, cache_1.setNoCache)(res);
        return res.json(data);
    }
    catch (error) {
        console.error('API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
