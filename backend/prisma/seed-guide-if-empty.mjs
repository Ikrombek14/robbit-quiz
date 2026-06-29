// Yo'riqnoma bo'limlarini guide-content.json dan joylaydi — LEKIN faqat baza BO'SH bo'lsa.
// Deploy paytida har safar ishlaydi:
//   - bo'sh bo'lsa → tayyor kontentni tiklaydi (o'chib ketmasin),
//   - allaqachon bo'lim bo'lsa → admin tahrirlarini BUZMAYDI (hech narsa qilmaydi).
// Foydalanish: node prisma/seed-guide-if-empty.mjs
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const count = await prisma.guideSection.count();
  if (count > 0) {
    console.log(`ℹ️  Yo'riqnomada ${count} ta bo'lim bor — o'zgartirilmadi.`);
  } else {
    const sections = require("./guide-content.json");
    for (const s of sections) {
      await prisma.guideSection.create({
        data: { order: s.order, title: s.title, icon: s.icon ?? null, body: s.body ?? "" },
      });
    }
    console.log(`✅ Yo'riqnoma bo'sh edi — ${sections.length} ta bo'lim joylandi.`);
  }
} finally {
  await prisma.$disconnect();
}
