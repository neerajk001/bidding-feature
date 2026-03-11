/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Proxy only backend API paths. NextAuth (/api/auth/session, signin, callback, etc.) stays on frontend.
const backendApiRewrites = () => {
    const base = `${backendUrl}/api`
    return [
        { source: '/api/health', destination: `${base}/health` },
        { source: '/api/admin/:path*', destination: `${base}/admin/:path*` },
        { source: '/api/auctions', destination: `${base}/auctions` },
        { source: '/api/auction/:path*', destination: `${base}/auction/:path*` },
        { source: '/api/auth/check-user', destination: `${base}/auth/check-user` },
        { source: '/api/auth/send-otp', destination: `${base}/auth/send-otp` },
        { source: '/api/auth/verify-otp', destination: `${base}/auth/verify-otp` },
        { source: '/api/auth/send-email-otp', destination: `${base}/auth/send-email-otp` },
        { source: '/api/auth/verify-email-otp', destination: `${base}/auth/verify-email-otp` },
        { source: '/api/auth/verify-test-otp', destination: `${base}/auth/verify-test-otp` },
        { source: '/api/register-bidder', destination: `${base}/register-bidder` },
        { source: '/api/place-bid', destination: `${base}/place-bid` },
        { source: '/api/winner/:path*', destination: `${base}/winner/:path*` },
        { source: '/api/cron/:path*', destination: `${base}/cron/:path*` },
    ]
}

const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
    async rewrites() {
        return {
            beforeFiles: backendApiRewrites(),
        }
    }
}

module.exports = nextConfig
