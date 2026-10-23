import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173/dropquote/', locale: 'en-US', headless: true, channel: process.env.CI ? undefined : 'msedge', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173/dropquote/', reuseExistingServer: !process.env.CI },
});
