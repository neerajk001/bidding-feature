"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../config/supabase");
const env_1 = require("../config/env");
const router = express_1.default.Router();
// Lightweight liveness endpoint: no database calls.
router.get('/healthz', (_req, res) => {
    return res.status(200).json({
        ok: true,
        backend: 'running'
    });
});
// Backward-compatible health endpoint kept DB-free to avoid probe-induced reads.
router.get('/health', (_req, res) => {
    return res.status(200).json({
        ok: true,
        backend: 'running'
    });
});
// Manual diagnostic endpoint: verifies Supabase connectivity.
router.get('/health-db', async (_req, res) => {
    const hasEnv = Boolean(env_1.env.supabaseUrl && env_1.env.supabaseServiceRoleKey);
    if (!hasEnv) {
        return res.status(200).json({
            ok: false,
            backend: 'running',
            supabase: 'not_configured',
            message: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env or frontend/.env.local'
        });
    }
    try {
        const { error } = await supabase_1.supabaseAdmin.from('auctions').select('id').limit(1);
        if (error) {
            return res.status(200).json({
                ok: false,
                backend: 'running',
                supabase: 'error',
                message: error.message,
                hint: 'Check Supabase URL, service role key, and that the auctions table exists.'
            });
        }
        return res.status(200).json({
            ok: true,
            backend: 'running',
            supabase: 'connected'
        });
    }
    catch (err) {
        return res.status(200).json({
            ok: false,
            backend: 'running',
            supabase: 'error',
            message: err?.message || 'Supabase request failed',
            hint: 'Check network and Supabase project status.'
        });
    }
});
exports.default = router;
