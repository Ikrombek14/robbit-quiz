import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./test/dbUrl.js";

// Testlar ALOHIDA bazada ishlaydi (test/dbUrl.ts — nomi "_test" bilan tugashi shart).
export default defineConfig({
  test: {
    dir: "test",
    include: ["**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    fileParallelism: false, // bitta umumiy test bazasi
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: "test-secret",
      CLIENT_URL: "http://localhost:5173",
      ADMIN_EMAILS: "super@test.local",
      MCP_ENABLED: "true",
      MCP_ISSUER_URL: "http://localhost:4000",
      MCP_ALLOWED_REDIRECTS: "https://claude.ai/api/mcp/auth_callback",
      DASHBOARD_INTERNAL_TOKEN: "",
    },
  },
});
