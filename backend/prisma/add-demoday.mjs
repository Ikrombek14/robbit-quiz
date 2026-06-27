// Demo Day yo'riqnomasini yangi bo'lim sifatida qo'shadi (DB + guide-content.json).
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const body = readFileSync(path.join(__dirname, "demoday-body.md"), "utf-8").trim();
const TITLE = "Demo Day o'tkazish yo'riqnomasi";
const ICON = "celebration";

async function main() {
  const exists = await prisma.guideSection.findFirst({ where: { title: TITLE } });
  const max = await prisma.guideSection.aggregate({ _max: { order: true } });
  const order = (max._max.order ?? -1) + 1;
  if (exists) {
    await prisma.guideSection.update({ where: { id: exists.id }, data: { body, icon: ICON } });
    console.log("Mavjud Demo Day bo'limi yangilandi.");
  } else {
    await prisma.guideSection.create({ data: { order, title: TITLE, icon: ICON, body } });
    console.log(`Demo Day bo'limi qo'shildi (order ${order}).`);
  }

  // guide-content.json
  const jsonPath = path.join(__dirname, "guide-content.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const idx = data.findIndex((s) => s.title === TITLE);
  if (idx >= 0) data[idx] = { ...data[idx], body, icon: ICON };
  else data.push({ order, title: TITLE, icon: ICON, body });
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
  console.log("guide-content.json yangilandi.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
