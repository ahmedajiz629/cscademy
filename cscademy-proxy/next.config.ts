import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow long-running API routes for WebSocket polling
  serverExternalPackages: ["ws"],
};

export default nextConfig;
