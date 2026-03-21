"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminEmail = isAdminEmail;
exports.requireAdmin = requireAdmin;
const jwt_1 = require("next-auth/jwt");
const env_1 = require("../config/env");
const supabase_1 = require("../config/supabase");
// Cache for admin emails from database
let adminEmailsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute
async function getAdminEmailsFromDb() {
    try {
        // Return cache if still valid
        const now = Date.now();
        if (adminEmailsCache && (now - cacheTimestamp) < CACHE_TTL) {
            return adminEmailsCache;
        }
        // Fetch from database
        const { data, error } = await supabase_1.supabaseAdmin
            .from('admin_settings')
            .select('value')
            .eq('key', 'admin_emails')
            .single();
        if (!error && data?.value && Array.isArray(data.value)) {
            adminEmailsCache = data.value.map((email) => email.toLowerCase());
            cacheTimestamp = now;
            return adminEmailsCache;
        }
        return [];
    }
    catch (error) {
        console.error('Error fetching admin emails from DB:', error);
        return [];
    }
}
async function isAdminEmail(email) {
    if (!email)
        return false;
    const normalizedEmail = email.toLowerCase();
    // Check env first (always valid)
    if (env_1.env.adminEmails.length > 0 && env_1.env.adminEmails.includes(normalizedEmail)) {
        return true;
    }
    // Check database
    const dbEmails = await getAdminEmailsFromDb();
    if (dbEmails.length > 0 && dbEmails.includes(normalizedEmail)) {
        return true;
    }
    return false;
}
// NextAuth JWT cookie names (frontend proxy sends Bearer token when rewrites would omit cookies)
const SESSION_COOKIE_NAMES = ['next-auth.session-token', '__Secure-next-auth.session-token'];
async function requireAdmin(req, res, next) {
    try {
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const jwt = authHeader.slice(7).trim();
            if (jwt) {
                const syntheticCookies = {};
                SESSION_COOKIE_NAMES.forEach((name) => {
                    syntheticCookies[name] = jwt;
                });
                token = await (0, jwt_1.getToken)({
                    req: { headers: {}, cookies: syntheticCookies },
                    secret: env_1.env.nextAuthSecret
                });
            }
        }
        if (!token) {
            token = await (0, jwt_1.getToken)({
                req: { headers: req.headers, cookies: req.cookies },
                secret: env_1.env.nextAuthSecret
            });
        }
        const email = token?.email;
        if (!token || !(await isAdminEmail(email))) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
