-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'LIVE',
    "totalSlides" INTEGER NOT NULL DEFAULT 0,
    "questionStats" TEXT NOT NULL DEFAULT '[]',
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_GameRecord" ("id", "pin", "playedAt", "questionStats", "quizId", "teacherId", "title", "totalSlides") SELECT "id", "pin", "playedAt", "questionStats", "quizId", "teacherId", "title", "totalSlides" FROM "GameRecord";
DROP TABLE "GameRecord";
ALTER TABLE "new_GameRecord" RENAME TO "GameRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
