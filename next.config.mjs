/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
