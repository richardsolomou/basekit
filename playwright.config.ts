import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  grep: process.env.CI ? /@ci/ : undefined,
  // WASM booleans are CPU-heavy and a CI runner takes several times longer than a
  // laptop, so the default 30s is not enough headroom.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: process.env.PLAYWRIGHT_TRACE ? 'on' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(process.env.CI ? { channel: 'chrome' } : {}) },
    },
  ],
  // Tests run against the production build: the WASM and font assets are fetched
  // by the worker at runtime, and only a real build proves they resolve.
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
