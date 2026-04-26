import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@horsebet/shared"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
