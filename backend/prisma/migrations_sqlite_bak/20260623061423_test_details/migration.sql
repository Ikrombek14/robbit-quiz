-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GamePlayerRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalAnswered" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "GamePlayerRecord_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GamePlayerRecord" ("correctCount", "gameId", "id", "nickname", "score", "totalAnswered") SELECT "correctCount", "gameId", "id", "nickname", "score", "totalAnswered" FROM "GamePlayerRecord";
DROP TABLE "GamePlayerRecord";
ALTER TABLE "new_GamePlayerRecord" RENAME TO "GamePlayerRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
