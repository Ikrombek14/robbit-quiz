-- AI tahlili natijalari: dars qaysi modulga tegishli va modul ichidagi taxminiy o'rni.
-- Slaydlardan AI aniqlaydi (lessonAI servisi); avto-tartiblashda kalit sifatida ishlatiladi.
-- AlterTable
ALTER TABLE "LessonPlan" ADD COLUMN "aiModule" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN "aiSeq" INTEGER;
