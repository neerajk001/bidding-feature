"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const env_1 = require("./config/env");
const rawBody_1 = require("./middleware/rawBody");
const rateLimit_1 = require("./middleware/rateLimit");
const cron_service_1 = require("./services/cron.service");
// Import routes
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const auction_routes_1 = __importDefault(require("./routes/auction.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const bidder_routes_1 = __importDefault(require("./routes/bidder.routes"));
const cron_routes_1 = __importDefault(require("./routes/cron.routes"));
const winner_routes_1 = __importDefault(require("./routes/winner.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const app = (0, express_1.default)();
// Basic middleware
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, cookie_parser_1.default)());
// Capture raw body for Razorpay webhook (must be before express.json())
app.use(rawBody_1.captureRawBody);
// Body parsing middleware
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// API router
const api = express_1.default.Router();
api.use(rateLimit_1.apiRateLimiter);
// Mount route modules
api.use(health_routes_1.default);
api.use(auction_routes_1.default);
api.use(auth_routes_1.default);
api.use(bidder_routes_1.default);
api.use(cron_routes_1.default);
api.use(winner_routes_1.default);
// Mount admin routes under /admin
api.use('/admin', admin_routes_1.default);
// Mount API router
app.use('/api', api);
// 404 handler - always return JSON
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Global error handler - always return JSON
app.use((err, _req, res, _next) => {
    console.error('Backend error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err?.message || undefined
    });
});
// Start server
const port = env_1.env.port;
app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
    // Initialize cron jobs for winner emails and payment checks
    (0, cron_service_1.initializeCronJobs)();
});
