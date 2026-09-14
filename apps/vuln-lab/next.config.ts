import type { NextConfig } from "next";

// apps/vuln-lab is a local-only, intentionally-vulnerable pentest lab. It has no
// `build`/`start` scripts (see package.json) and is excluded from `ci.yml`, so this config
// only ever needs to support `next dev`. See apps/vuln-lab/CLAUDE.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
