// O'quv rejadagi barcha darslarni curriculum.json ga eksport qiladi.
// Telegram hisobot boti shu fayldan mavzular ro'yxatini oladi.
//
// Ishlatish (backend papkasida, serverda yoki lokalda):
//   node scripts/export-curriculum.mjs
// Natija: backend/curriculum.json
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();
const lessons = await prisma.lessonPlan.findMany({
  orderBy: [
    { subject: "asc" },
    { ageGroup: "asc" },
    { year: "asc" },
    { section: "asc" },
    { order: "asc" },
  ],
  select: {
    subject: true,
    ageGroup: true,
    year: true,
    section: true,
    order: true,
    title: true,
  },
});
writeFileSync("curriculum.json", JSON.stringify(lessons, null, 1), "utf-8");
console.log(`curriculum.json: ${lessons.length} ta dars saqlandi`);
await prisma.$disconnect();
