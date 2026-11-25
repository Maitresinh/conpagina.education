import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip TypeScript type-checking during build (do it in CI/dev instead)
  // This MASSIVELY speeds up Docker builds
  typescript: {
    ignoreBuildErrors: true,
  },
  typedRoutes: true,
  reactCompiler: true,
  // Turbopack config (Next.js 16 default bundler)
  // Empty config to acknowledge we're using Turbopack
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/api/cover/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/api/cover/**",
      },
      {
        protocol: "https",
        hostname: "**",
        pathname: "/api/cover/**",
      },
    ],
  },
  // Security headers
  async headers() {
    const apiServerUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const otherApiUrl = "https://api.lectio.app"; // Always allow prod domain just in case

    const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data: ${apiServerUrl} ${appUrl} ${otherApiUrl};
      font-src 'self' blob: data:;
      worker-src 'self';
      connect-src 'self' ${apiServerUrl} ${appUrl} ${otherApiUrl};
    `.replace(/\s{2,}/g, " ").trim();

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
