const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@citizens-wear/ui', '@citizens-wear/connect-client', '@citizens-wear/db'],
  // Pin the workspace root so Next doesn't mistakenly pick up a stray
  // `package-lock.json` elsewhere on the dev machine (e.g. in `$HOME`).
  // Next.js will otherwise warn: "We detected multiple lockfiles...".
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    typedRoutes: true,
  },
  // Defence-in-depth HTTP security headers. These apply to every response
  // served by the Next.js app (static + dynamic). CSP is deliberately
  // conservative for Phase 2; it will be tightened again in Phase 9 when
  // observability (Sentry) and media (R2) domains are finalised.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
