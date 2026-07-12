import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Neon serverless driver and its ws dependency must run as real Node modules,
  // not be bundled by turbopack (bundling breaks module evaluation during build's
  // "collect page data" phase). Keep them external so they're required at runtime.
  serverExternalPackages: [
    "@neondatabase/serverless",
    "ws",
    "ai",
    "@ai-sdk/google",
  ],
};

export default nextConfig;
