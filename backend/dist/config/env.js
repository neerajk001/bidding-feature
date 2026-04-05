"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load env: backend folder first, then frontend/root (so backend/.env works too)
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '..', 'frontend', '.env.local') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '..', 'frontend', '.env') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '..', '.env.local') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '..', '.env') });
function normalizeUrl(value) {
    return value.trim().replace(/\/$/, '');
}
const resolvedPublicAppUrl = normalizeUrl(process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '');
const publicAppUrl = resolvedPublicAppUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '');
if (process.env.NODE_ENV === 'production' && (!publicAppUrl || /localhost|127\.0\.0\.1/i.test(publicAppUrl))) {
    console.error('[ENV] PUBLIC_APP_URL (or NEXT_PUBLIC_APP_URL) is missing or points to localhost in production. Winner email links will be invalid.');
}
exports.env = {
    // Supabase
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    // Razorpay
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    // NextAuth
    nextAuthSecret: process.env.NEXTAUTH_SECRET || '',
    adminEmails: (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    // Twilio (optional)
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    // Resend (optional)
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
    resendReplyToEmail: process.env.RESEND_REPLY_TO_EMAIL || '',
    // Delhivery (optional)
    delhiveryEnabled: String(process.env.DELHIVERY_ENABLED || 'true').toLowerCase() === 'true',
    delhiveryApiKey: process.env.DELHIVERY_API_KEY || '',
    delhiveryApiBaseUrl: process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com/api',
    delhiveryPickupLocation: process.env.DELHIVERY_PICKUP_LOCATION || 'Nine Hills Society, NIBM',
    delhiveryTimeoutMs: Number(process.env.DELHIVERY_TIMEOUT_MS || 8000),
    delhiveryRetryAttempts: Number(process.env.DELHIVERY_RETRY_ATTEMPTS || 3),
    delhiveryRetryDelayMs: Number(process.env.DELHIVERY_RETRY_DELAY_MS || 1000),
    // API
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    publicAppUrl,
    port: Number(process.env.PORT || 3001),
    // Traffic / egress guardrails
    auctionListCacheSeconds: Number(process.env.AUCTION_LIST_CACHE_SECONDS || 20),
    auctionDetailCacheLiveSeconds: Number(process.env.AUCTION_DETAIL_CACHE_LIVE_SECONDS || 5),
    auctionDetailCacheIdleSeconds: Number(process.env.AUCTION_DETAIL_CACHE_IDLE_SECONDS || 45),
    auctionLiveStateCacheSeconds: Number(process.env.AUCTION_LIVE_STATE_CACHE_SECONDS || 2),
    rateLimitAuctionLiveStatePerMinute: Number(process.env.RATE_LIMIT_AUCTION_LIVE_STATE_PER_MIN || 90),
    rateLimitAuctionDetailPerMinute: Number(process.env.RATE_LIMIT_AUCTION_DETAIL_PER_MIN || 45),
    rateLimitAuctionsListPerMinute: Number(process.env.RATE_LIMIT_AUCTIONS_LIST_PER_MIN || 20),
    rateLimitGlobalPerMinute: Number(process.env.RATE_LIMIT_GLOBAL_PER_MIN || 120)
};
