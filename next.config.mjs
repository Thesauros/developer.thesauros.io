/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: [],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    return [
      {
        source: '/api/v1/partners/:path*',
        destination: 'http://localhost:3001/api/v1/partners/:path*',
      },
      {
        source: '/api/v1/partner/:path*',
        destination: 'http://localhost:3001/api/v1/partner/:path*',
      },
    ];
  },
};

export default nextConfig;
