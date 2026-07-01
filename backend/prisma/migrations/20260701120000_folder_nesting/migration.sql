-- Ichma-ich papkalar: Folder'ga parentId (o'ziga self-relation). Additiv — ma'lumotga tegmaydi.

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
