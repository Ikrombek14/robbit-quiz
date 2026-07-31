-- Toifa oshirish arizasi: profil (telefon, sertifikatlar) + ariza jadvali. Additiv, ma'lumotga tegmaydi.
ALTER TABLE "Teacher" ADD COLUMN "phone" TEXT;

CREATE TABLE "TeacherCertificate" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TierApplication" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "fromTier" INTEGER NOT NULL,
    "toTier" INTEGER NOT NULL,
    "note" TEXT,
    "checklist" TEXT NOT NULL,
    "certificateIds" TEXT NOT NULL,
    "kpiSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "TierApplication_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TeacherCertificate" ADD CONSTRAINT "TeacherCertificate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TierApplication" ADD CONSTRAINT "TierApplication_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
