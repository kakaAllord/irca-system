import { defineConfig, devices } from '@playwright/test';

// The journeys run against their own API and portal, on their own ports and
// the test database, so they never collide with servers you have running for
// development.
const API_PORT = 4100;
const PORTAL_PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORTAL_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Locally, the Chrome already installed; in CI, Playwright's own Chromium.
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: [
    {
      // From apps/api, which is where the API looks for its .env.test.
      command: 'npm run -s build && node dist/main.js',
      cwd: 'apps/api',
      url: `http://localhost:${API_PORT}/health`,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        PORTAL_ORIGIN: `http://localhost:${PORTAL_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run -s dev -w @irca/portal -- -p ${PORTAL_PORT}`,
      url: `http://localhost:${PORTAL_PORT}/login`,
      env: {
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
        SESSION_COOKIE_NAME: 'irca_session',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
