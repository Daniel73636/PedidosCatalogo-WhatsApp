import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @pedidos/api dev",
      url: "http://127.0.0.1:4100/ready",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development", DEMO_MODE: "false",
        API_PORT: "4100", WEB_ORIGIN: "http://127.0.0.1:3100",
        JWT_SECRET: "e2e-secret-with-at-least-thirty-two-characters",
      },
    },
    {
      command: "pnpm --filter @pedidos/web exec next dev -p 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:4100" },
    },
  ],
});
