-- Qo'shimcha darslar bo'limi (O'quv dastur ichida uchinchi segment) — additiv, ma'lumotga tegmaydi
CREATE TABLE "ExtraLesson" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "quizId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraLesson_pkey" PRIMARY KEY ("id")
);
