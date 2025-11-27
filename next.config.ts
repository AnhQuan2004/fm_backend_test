import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CORS is handled dynamically in API routes via /lib/cors.ts
  // No hardcoded headers here to allow proper CORS control
};

export default nextConfig;
