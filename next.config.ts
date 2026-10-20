import type { NextConfig } from 'next';
import path from 'path';

const isAndroid = process.env.BUILD_TARGET === 'android';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    unoptimized: isAndroid,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  ...(isAndroid
    ? { output: 'export' as const, trailingSlash: true }
    : { output: 'standalone' as const }),
  transpilePackages: ['motion'],
  webpack: (config, { dev, isServer, webpack }) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: any) => {
        resource.request = resource.request.replace(/^node:/, '');
      })
    );
    config.resolve.alias = {
      ...config.resolve.alias,
      pptxgenjs$: path.resolve(__dirname, 'node_modules/pptxgenjs/dist/pptxgen.bundle.js'),
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
