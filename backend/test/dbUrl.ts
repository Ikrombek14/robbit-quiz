import dotenv from "dotenv";

// Test bazasi manzili: TEST_DATABASE_URL yoki .env dagi DATABASE_URL'dan baza nomi
// "<nom>_test" ga almashtiriladi. Natija "_test" bilan tugamasa — xato (dev/prod bazani
// tozalab yubormaslik kafolati). vitest.config.ts va globalSetup ikkalasi shu funksiyani ishlatadi.
export function testDatabaseUrl(): string {
  const fileEnv = dotenv.config({ path: ".env", processEnv: {} }).parsed ?? {};
  const base = process.env.TEST_DATABASE_URL ?? fileEnv.DATABASE_URL ?? "";
  let url = base;
  if (!process.env.TEST_DATABASE_URL && base) {
    const u = new URL(base);
    const db = u.pathname.replace(/^\//, "").replace(/_dev$/, "");
    u.pathname = `/${db.endsWith("_test") ? db : `${db}_test`}`;
    url = u.toString();
  }
  const dbName = url ? new URL(url).pathname.replace(/^\//, "") : "";
  if (!dbName.endsWith("_test")) {
    throw new Error(`Test bazasi nomi "_test" bilan tugashi shart (hozir: "${dbName || "yo'q"}"). TEST_DATABASE_URL bering.`);
  }
  return url;
}
