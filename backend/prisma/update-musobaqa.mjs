// Faqat "Musobaqa" bo'limini yangilaydi (qolgan bo'limlarga tegmaydi).
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const body = readFileSync(path.join(__dirname, "musobaqa-body.md"), "utf-8").trim();

async function main() {
  // DB'da Musobaqa bo'limini yangilash
  const sec = await prisma.guideSection.findFirst({ where: { title: { contains: "Musobaqa" } } });
  if (!sec) { console.log("Musobaqa bo'limi topilmadi."); return; }
  await prisma.guideSection.update({ where: { id: sec.id }, data: { body } });
  console.log(`DB yangilandi: "${sec.title}"`);

  // guide-content.json'ni ham yangilash (kelajakdagi seed uchun)
  const jsonPath = path.join(__dirname, "guide-content.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const item = data.find((s) => s.title.includes("Musobaqa"));
  if (item) { item.body = body; writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8"); console.log("guide-content.json yangilandi."); }
}

main().catch(console.error).finally(() => prisma.$disconnect());
