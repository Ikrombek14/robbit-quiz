-- Teacher'ga "slayd qilish" ruxsati ustuni (default false — admin tanlab beradi)
-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "canCreate" BOOLEAN NOT NULL DEFAULT false;
