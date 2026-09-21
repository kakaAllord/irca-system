import type { NextConfig } from 'next';
import { securityHeaders } from '@irca/shared';

const apiUrl = process.env.API_INTERNAL_URL;

const nextConfig: NextConfig = {
  // next dev would otherwise write AGENTS.md and CLAUDE.md into this folder
  // whenever it detects a coding agent. Agent notes live outside the
  // repository, in the working folder around it.
  agentRules: false,
  // Nothing gains from announcing the framework and its version.
  poweredByHeader: false,
  async headers() {
    // The headers that are the same for every request. The content policy is
    // per request, with a nonce, and is set in proxy.ts.
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  // The shared package is plain JavaScript today, but will carry the
  // registration flow; compiling it with the app keeps one build pipeline.
  transpilePackages: ['@irca/shared'],
  async rewrites() {
    if (!apiUrl) return [];
    // The browser only ever talks to the portal's own origin. /api/* is handed
    // to the API here, so the session cookie the API sets is first-party to
    // the portal and no cross-origin requests exist at all.
    return [{ source: '/api/:path*', destination: `${apiUrl}/v1/:path*` }];
  },
};

export default nextConfig;
