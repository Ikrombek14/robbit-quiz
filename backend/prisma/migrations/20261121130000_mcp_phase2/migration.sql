-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "QuizRevision" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpPendingAction" (
    "id" TEXT NOT NULL,
    "actionHash" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "quizId" TEXT,
    "quizVersion" INTEGER,
    "summary" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizRevision_quizId_createdAt_idx" ON "QuizRevision"("quizId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpPendingAction_actionHash_key" ON "McpPendingAction"("actionHash");

-- CreateIndex
CREATE INDEX "McpPendingAction_teacherId_status_idx" ON "McpPendingAction"("teacherId", "status");

-- CreateIndex
CREATE INDEX "McpPendingAction_expiresAt_idx" ON "McpPendingAction"("expiresAt");

-- AddForeignKey
ALTER TABLE "QuizRevision" ADD CONSTRAINT "QuizRevision_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
