// Ustozlar yo'riqnomasi — bo'limlarni guide-content.json dan DB'ga joylash.
// Mavjud bo'limlar o'chirilib, fayldagi to'liq kontent qayta yoziladi.
// Ishga tushirish:  node prisma/seed-guide.mjs
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sections = JSON.parse(readFileSync(path.join(__dirname, "guide-content.json"), "utf-8"));

async function main() {
  await prisma.guideSection.deleteMany({});
  for (const s of sections) {
    await prisma.guideSection.create({
      data: { order: s.order, title: s.title, icon: s.icon ?? null, body: s.body ?? "" },
    });
  }
  console.log(`${sections.length} ta bo'lim joylandi.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
