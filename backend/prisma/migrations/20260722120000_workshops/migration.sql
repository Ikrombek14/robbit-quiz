-- Workshoplar bo'limi: umumiy (yosh toifasiga bo'linmaydigan) mashg'ulotlar ro'yxati
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "quizId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);
