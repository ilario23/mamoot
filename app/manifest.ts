import type { MetadataRoute } from "next";

const manifest = (): MetadataRoute.Manifest => ({
  name: "RunTeam AI",
  short_name: "RunTeam",
  description: "AI-powered running analytics with Strava integration",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#e54ff0",
  icons: [
    {
      src: "/icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
});

export default manifest;
