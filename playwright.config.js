// Playwright configuration – E2E tests run against the real app served on localhost:8080
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'on',          // a screenshot of every test is attached to the HTML report
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Mobile (Pixel 5) – Edge',
      use: { ...devices['Pixel 5'], channel: 'msedge' },
    },
  ],
  webServer: {
    command: 'python -m http.server 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
  },
});
