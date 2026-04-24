"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cron_service_1 = require("../services/cron.service");
const router = express_1.default.Router();
const CRON_ROUTE_WINDOW_MS = 60 * 60 * 1000;
const CRON_ROUTE_MAX_CALLS = 5;
let cronWindowStartedAt = Date.now();
let cronWindowCalls = 0;
function applyCronRouteRateLimit(res) {
    const now = Date.now();
    if (now - cronWindowStartedAt >= CRON_ROUTE_WINDOW_MS) {
        cronWindowStartedAt = now;
        cronWindowCalls = 0;
    }
    if (cronWindowCalls >= CRON_ROUTE_MAX_CALLS) {
        const retryAfter = Math.max(1, Math.ceil((cronWindowStartedAt + CRON_ROUTE_WINDOW_MS - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
            error: 'Cron trigger rate limit exceeded',
            retry_after_seconds: retryAfter
        });
        return false;
    }
    cronWindowCalls += 1;
    return true;
}
router.post('/cron/check-winner-payments', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return res.status(503).json({ error: 'CRON_SECRET is not configured' });
    }
    if (!applyCronRouteRateLimit(res)) {
        return;
    }
    const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (provided !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const result = await (0, cron_service_1.runWinnerPaymentCheck)('http-route');
        return res.json({ ok: true, ...result });
    }
    catch (e) {
        console.error('Cron check-winner-payments error:', e);
        return res.status(500).json({ error: 'Cron failed' });
    }
});
exports.default = router;
