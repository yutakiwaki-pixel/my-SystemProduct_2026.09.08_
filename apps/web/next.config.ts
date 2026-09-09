import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/database"],
  // "standalone" output breaks `next start`, so it's only enabled for the
  // Docker build (see apps/web/Dockerfile), not for local/CI `next start`.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
