-- CreateTable
CREATE TABLE "GameRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "totalSlides" INTEGER NOT NULL DEFAULT 0,
    "questionStats" TEXT NOT NULL DEFAULT '[]',
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GamePlayerRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalAnswered" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GamePlayerRecord_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
