"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureRawBody = captureRawBody;
// Capture raw body for Razorpay webhook (signature verification requires unmodified body)
function captureRawBody(req, res, next) {
    if (req.originalUrl === '/api/winner/webhook' && req.method === 'POST') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            req.rawBody = Buffer.concat(chunks);
            next();
        });
    }
    else {
        next();
    }
}
