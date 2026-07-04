-- Ustozlik so'rovi: roster'da bo'lmagan foydalanuvchi admin tasdig'iga so'rov yuboradi
-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "teacherRequestAt" TIMESTAMP(3);
ALTER TABLE "Teacher" ADD COLUMN "teacherRequestName" TEXT;
