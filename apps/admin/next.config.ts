import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@davao-bank/shared'],
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
};

export default nextConfig;
