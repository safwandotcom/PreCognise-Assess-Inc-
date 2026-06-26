// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent ioredis (and other native Node.js packages) from being bundled
  // into the Edge Runtime where middleware runs. ioredis uses net/tls/dns
  // which are not available in the Edge Runtime.
  serverExternalPackages: ["ioredis"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;