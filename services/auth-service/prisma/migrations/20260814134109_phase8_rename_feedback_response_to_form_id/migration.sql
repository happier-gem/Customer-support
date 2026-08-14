/*
  Warnings:

  - You are about to drop the column `feedbackResponseId` on the `notifications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "feedbackResponseId",
ADD COLUMN     "feedbackFormId" TEXT;
