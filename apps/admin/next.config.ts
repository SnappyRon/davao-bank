import type { NextConfig } from 'next';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline'";

const connectSrc = isDev
  ? "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 https://qomxlzvrovwsfneqsfej.supabase.co https://*.supabase.co wss://*.supabase.co"
  : "connect-src 'self' https://qomxlzvrovwsfneqsfej.supabase.co https://*.supabase.co wss://*.supabase.co";

const nextConfig: NextConfig = {
  transpilePackages: ['@davao-bank/shared'],
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              connectSrc,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
