-- Ariza: KPI talabi bajarilmagan bo'lsa ham "o'quv bo'limi bilan maslahatlashilgan"
-- deb belgilab topshirish imkoni. Additiv, mavjud ma'lumotga tegmaydi.
ALTER TABLE "TierApplication" ADD COLUMN "consultedStudyDept" BOOLEAN NOT NULL DEFAULT false;
