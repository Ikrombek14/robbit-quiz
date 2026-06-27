// Keraksiz bo'limlarni o'chiradi va qolganlarni qayta tartiblaydi (DB + guide-content.json).
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REMOVE = [
  "Dars uchun Fidbeklardan namunalar",
  "Ustozlar uchun muhim havolalar",
  "Workshop (filial & maktab) yo'riqnoma",
  "Maxfiylik eslatmasi",
];

const shouldRemove = (title) => REMOVE.some((r) => title.trim() === r.trim());

async function main() {
  // DB
  const all = await prisma.guideSection.findMany({ orderBy: { order: "asc" } });
  const remaining = all.filter((s) => !shouldRemove(s.title));
  for (const s of all) {
    if (shouldRemove(s.title)) {
      await prisma.guideSection.delete({ where: { id: s.id } });
      console.log(`O'chirildi: "${s.title}"`);
    }
  }
  // qayta tartiblash
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].order !== i) {
      await prisma.guideSection.update({ where: { id: remaining[i].id }, data: { order: i } });
    }
  }
  console.log(`Qolgan bo'limlar: ${remaining.length} ta`);

  // guide-content.json
  const jsonPath = path.join(__dirname, "guide-content.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"))
    .filter((s) => !shouldRemove(s.title))
    .map((s, i) => ({ ...s, order: i }));
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
  console.log("guide-content.json yangilandi.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
