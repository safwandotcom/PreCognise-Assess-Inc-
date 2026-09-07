// next.config.ts
import type { NextConfig } from "next";

// Socket-server origin (Railway) that candidate/admin pages connect to over
// WebSocket — kept as one constant so the HTTPS and WSS forms in the CSP
// below can't drift apart.
const SOCKET_ORIGIN = "https://precognise-assess-production-2ada.up.railway.app";
const SOCKET_ORIGIN_WSS = SOCKET_ORIGIN.replace("https://", "wss://");

// Report-only for now (task #75) — logs violations to the browser console
// without blocking anything. Clerk auth and the socket connection are both
// hard dependencies of this app, and this couldn't be verified against a
// live browser before shipping; flip to the enforcing
// "Content-Security-Policy" header once the console is confirmed clean on
// both the candidate and admin surfaces.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next.js's own hydration payload ships as inline <script> tags without a
  // nonce setup, and Clerk's SDK needs its own scripts — 'unsafe-inline'/
  // 'unsafe-eval' here keep the report meaningful instead of just being
  // noisy about things that already need an allowance.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com https://placehold.co",
  "font-src 'self' data:",
  `connect-src 'self' https://*.clerk.accounts.dev ${SOCKET_ORIGIN} ${SOCKET_ORIGIN_WSS}`,
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking — this app has no legitimate reason to be framed
          // by another site.
          { key: "X-Frame-Options", value: "DENY" },
          // Stop the browser guessing content-types away from what the
          // server declared.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send the full referrer only same-origin; cross-origin gets just
          // the origin, never the full candidate/admin URL path.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 2 years, subdomains included. Vercel already serves this app
          // over HTTPS by default; this tells browsers to never even try
          // plain HTTP for it again.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
