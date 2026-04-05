import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,       // keep serial — tests share login state
  retries: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
