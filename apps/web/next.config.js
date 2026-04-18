/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@citizens-wear/ui', '@citizens-wear/connect-client', '@citizens-wear/db'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
