import { defineConfig, devices } from '@playwright/test';

// The journeys run against their own API and portal, on their own ports and
// the test database, so they never collide with servers you have running for
// development.
const API_PORT = 4100;
const PORTAL_PORT = 3100;
const FORM_PORT = 3101;
/** The seed's key for IRCA's form. Test and development only. */
const FORM_KEY = 'irk_local_registration_form_key_not_for_production';

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
        REGISTRATION_ORIGIN: `http://localhost:${FORM_PORT}`,
        // Every journey signs in from this one machine, more than ten a minute.
        SIGN_IN_PER_MINUTE: '100',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Built and served the way it is deployed, not `next dev`: in development
      // the portal recompiles routes on demand and Fast Refresh reloads the
      // page, which cancels a navigation a journey has just started. Rewrites
      // are baked in at build time, so the API's address is set for both.
      command: `npm run -s build -w @irca/portal && npm run -s start -w @irca/portal -- -p ${PORTAL_PORT}`,
      url: `http://localhost:${PORTAL_PORT}/login`,
      env: {
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
        SESSION_COOKIE_NAME: 'irca_session',
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      // The visitor's form, on the API, as it runs after the cutover.
      command: `npm run -s build -w @irca/registration && npm run -s start -w @irca/registration -- -p ${FORM_PORT}`,
      url: `http://localhost:${FORM_PORT}/`,
      env: {
        REGISTRATION_BACKEND: 'api',
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
        REGISTRATION_API_KEY: FORM_KEY,
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
