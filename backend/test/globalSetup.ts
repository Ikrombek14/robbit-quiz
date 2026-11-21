import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./dbUrl.js";

// Test bazasiga migratsiyalarni qo'llaydi (forward-only, `migrate deploy`).
export default function setup(): void {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
