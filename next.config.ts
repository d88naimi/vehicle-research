import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["img.youtube.com", "i.ytimg.com"],
  },
};

export default nextConfig;
