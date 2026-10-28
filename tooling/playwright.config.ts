import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against dev-store (Ecommerce plugin) with the mock model and Mailpit for OTP emails.
 *   docker compose up -d && pnpm --filter dev-store seed
 *   AI_MOCK=1 pnpm --filter @payload-ai-suite/tooling exec playwright test
 * Set E2E_BASE_URL to test an already running server (the webServer block is then skipped).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-US' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /shopper\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter dev-store dev',
        cwd: '..',
        url: `${baseURL}/admin`,
        timeout: 180_000,
        reuseExistingServer: true,
        env: { AI_MOCK: '1', JOBS_AUTORUN: '1' },
      },
})
