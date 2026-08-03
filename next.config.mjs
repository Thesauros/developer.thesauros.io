/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: [],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    const apiBase = process.env.PARTNER_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/v1/partners/:path*',
        destination: `${apiBase}/api/v1/partners/:path*`,
      },
      {
        source: '/api/v1/partner/:path*',
        destination: `${apiBase}/api/v1/partner/:path*`,
      },
    ];
  },
};

export default nextConfig;
