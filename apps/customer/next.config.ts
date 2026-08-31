import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js dev mode blocks cross-origin requests to its own dev assets
  // (HMR, fonts, RSC payloads) by default — necessary when this app is
  // opened from another device on the network (e.g. scanning the
  // customer-join QR code from a phone) via the machine's LAN IP instead of
  // localhost. Without this, the page hangs on "Loading..." forever because
  // its own JS/font requests get silently blocked. Update this IP if the
  // machine's LAN address changes — see CUSTOMER_APP_URL in
  // services/auth-service/.env for the matching note.
  allowedDevOrigins: ["192.168.9.7"],
};

export default nextConfig;
