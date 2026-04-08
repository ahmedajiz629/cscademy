import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow long-running API routes for WebSocket polling
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["ws"],
};

export default nextConfig;
