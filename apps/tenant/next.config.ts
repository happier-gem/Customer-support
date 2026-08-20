import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // See apps/customer/next.config.ts for why this is needed — allows this
  // app's dev assets to load when opened from another device on the LAN.
  allowedDevOrigins: ["192.168.8.123"],
};

export default nextConfig;
