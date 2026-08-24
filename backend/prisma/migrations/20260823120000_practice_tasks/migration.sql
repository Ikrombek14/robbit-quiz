-- Ustozlik amaliyoti vazifalari bo'limi — additiv, mavjud ma'lumotga tegmaydi
CREATE TABLE "PracticeTask" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "tasks" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT,
    "resources" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeTask_pkey" PRIMARY KEY ("id")
);
