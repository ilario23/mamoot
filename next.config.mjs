import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },

  // Allow Strava profile images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dgalywyr863hv.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "*.strava.com",
      },
    ],
  },

  // Prevent browser caching of the service worker
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
