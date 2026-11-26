-- Dars baholari: o'quvchi bo'yicha (davomat, uy vazifasi, quiz, amaliyot, odob) va sessiya guruhi
-- Faqat additiv: mavjud ma'lumotga tegmaydi
ALTER TABLE "GamePlayerRecord" ADD COLUMN "grades" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "GameRecord" ADD COLUMN "groupName" TEXT;
CREATE INDEX "GameRecord_teacherId_groupName_idx" ON "GameRecord"("teacherId", "groupName");
