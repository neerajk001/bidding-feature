"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRateLimiter = apiRateLimiter;
const buckets = new Map();
const rules = [
    // Heavy realtime read paths
    { name: 'auction_live_state', method: 'GET', path: /^\/auction\/[^/]+\/live-state$/, windowMs: 60_000, max: 120 },
    { name: 'auction_detail', method: 'GET', path: /^\/auction\/[^/]+$/, windowMs: 60_000, max: 60 },
    { name: 'auctions_list', method: 'GET', path: /^\/auctions$/, windowMs: 60_000, max: 30 },
    // Write paths
    { name: 'place_bid', method: 'POST', path: /^\/place-bid$/, windowMs: 60_000, max: 30 },
    { name: 'register_bidder', method: 'POST', path: /^\/register-bidder$/, windowMs: 60_000, max: 15 },
    // OTP abuse protection
    { name: 'send_email_otp', method: 'POST', path: /^\/auth\/send-email-otp$/, windowMs: 60 * 60_000, max: 10 },
    { name: 'verify_email_otp', method: 'POST', path: /^\/auth\/verify-email-otp$/, windowMs: 60 * 60_000, max: 40 },
    { name: 'send_phone_otp', method: 'POST', path: /^\/auth\/send-otp$/, windowMs: 60 * 60_000, max: 12 },
    { name: 'verify_phone_otp', method: 'POST', path: /^\/auth\/verify-otp$/, windowMs: 60 * 60_000, max: 50 },
    // Global default as final fallback
    { name: 'global', path: /^\/.*/, windowMs: 60_000, max: 180 }
];
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim();
    }
    if (Array.isArray(xff) && xff.length > 0) {
        return String(xff[0] || '').trim() || 'unknown';
    }
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim())
        return xRealIp.trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}
function pickRule(req) {
    const method = String(req.method || '').toUpperCase();
    const path = req.path || '/';
    return (rules.find((rule) => {
        if (rule.method && rule.method !== method)
            return false;
        return rule.path.test(path);
    }) || rules[rules.length - 1]);
}
function setRateLimitHeaders(res, limit, remaining, resetAt) {
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}
function cleanupBuckets(now) {
    if (buckets.size < 2_000)
        return;
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
            buckets.delete(key);
        }
    }
}
function apiRateLimiter(req, res, next) {
    // Always allow internal availability checks and webhook callbacks.
    if (req.path === '/health' || req.path === '/winner/webhook') {
        next();
        return;
    }
    const rule = pickRule(req);
    const ip = getClientIp(req);
    const now = Date.now();
    const key = `${rule.name}:${ip}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
        const resetAt = now + rule.windowMs;
        buckets.set(key, { count: 1, resetAt });
        setRateLimitHeaders(res, rule.max, rule.max - 1, resetAt);
        cleanupBuckets(now);
        next();
        return;
    }
    if (current.count >= rule.max) {
        const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        setRateLimitHeaders(res, rule.max, 0, current.resetAt);
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
            error: 'Too many requests. Please slow down and retry shortly.',
            rule: rule.name,
            retry_after_seconds: retryAfter
        });
        return;
    }
    current.count += 1;
    buckets.set(key, current);
    setRateLimitHeaders(res, rule.max, rule.max - current.count, current.resetAt);
    next();
}
