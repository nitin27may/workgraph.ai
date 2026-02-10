import type { NextConfig } from "next";

// Disable TLS verification for development (corporate proxy with self-signed certs)
if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const nextConfig: NextConfig = {
  // Enable standalone output for Docker optimization
  output: "standalone",
  
  // Additional configuration options
  reactStrictMode: true,
  
  // Disable telemetry
  // eslint: {
  //   ignoreDuringBuilds: false,
  // },
};

export default nextConfig;
