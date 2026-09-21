import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: false,
  // The questions, their languages and the validation live in the shared
  // package now, so the API and the portal read the same copy.
  transpilePackages: ['@irca/shared'],
  // next dev would otherwise write AGENTS.md and CLAUDE.md into this folder
  // whenever it detects a coding agent. Agent notes live outside the
  // repository, in the working folder around it.
  agentRules: false,
  images: {
    // AVIF first: the logo's globe is full of fine network lines, which is
    // exactly the kind of detail AVIF carries at a much lower bitrate than
    // WebP. Browsers that do not accept it fall back to WebP automatically.
    formats: ['image/avif', 'image/webp'],
    // The mark is never drawn larger than ~112px, so there is no reason to
    // generate or cache the default ladder up to 3840px.
    imageSizes: [64, 96, 112, 128, 192, 224, 256, 384],
    deviceSizes: [640, 828, 1080],
  },
};

export default nextConfig;
