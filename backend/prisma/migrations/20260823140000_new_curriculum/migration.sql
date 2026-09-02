-- Yangi o'quv dastur (oylik modullar) — additiv, mavjud ma'lumotga tegmaydi
CREATE TABLE "NewCurriculumLesson" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "quizId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewCurriculumLesson_pkey" PRIMARY KEY ("id")
);
