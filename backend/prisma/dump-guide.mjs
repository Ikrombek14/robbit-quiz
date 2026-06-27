import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const s = await prisma.guideSection.findMany({ orderBy: { order: "asc" } });
writeFileSync(path.join(__dirname, "guide-content.json"),
  JSON.stringify(s.map((x) => ({ order: x.order, title: x.title, icon: x.icon, body: x.body })), null, 2), "utf-8");
console.log("dumped", s.length);
await prisma.$disconnect();
