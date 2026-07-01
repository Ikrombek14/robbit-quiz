-- Tashqi manba (Wayground/Quizizz) quiz ID — ommaviy importda takrorni aniqlash uchun.
-- Additiv: mavjud ma'lumotga tegmaydi.
ALTER TABLE "Quiz" ADD COLUMN "sourceId" TEXT;
CREATE INDEX "Quiz_teacherId_sourceId_idx" ON "Quiz"("teacherId", "sourceId");
