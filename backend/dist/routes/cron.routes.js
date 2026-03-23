"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cron_service_1 = require("../services/cron.service");
const router = express_1.default.Router();
router.post('/cron/check-winner-payments', async (req, res) => {
    const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
    const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (secret && provided !== secret) {
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
