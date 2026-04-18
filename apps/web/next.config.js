/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@citizens-wear/ui', '@citizens-wear/connect-client'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
