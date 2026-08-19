/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "0.0.0.0:5000"],
    },
  },
  allowedDevOrigins: ["*.picard.replit.dev", "*.replit.dev", "127.0.0.1"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};
export default nextConfig;
