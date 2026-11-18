/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  turbopack: { root: process.cwd() },
  images: { unoptimized: true },
  experimental: { agentUpgrade: 'security' },
};

export default nextConfig;
