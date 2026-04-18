/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@citizens-wear/ui', '@citizens-wear/connect-client', '@citizens-wear/db'],
  typedRoutes: true,
};

module.exports = nextConfig;
