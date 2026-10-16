-- Tekshirilmagan uy vazifa bloki (ogohlantirish hisobi + admin vaqtincha ochishi).
-- Additiv, mavjud ma'lumotga tegmaydi.
ALTER TABLE "Teacher" ADD COLUMN "hwStrikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Teacher" ADD COLUMN "hwStrikeDay" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "hwUnlockUntil" TIMESTAMP(3);
