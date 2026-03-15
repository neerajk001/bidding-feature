/** @type {import('next').NextConfig} */
// All /api/* backend calls are proxied at runtime by app/api/[[...path]]/route.ts and
// app/api/admin/[[...path]]/route.ts so BACKEND_URL is read from env when the request runs
// (fixes production where build-time env can differ from runtime).

const nextConfig = {
    output: 'standalone',
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
}

module.exports = nextConfig
