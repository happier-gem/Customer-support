/*
  Warnings:

  - You are about to drop the column `passwordResetTokenHash` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_passwordResetTokenHash_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "passwordResetTokenHash",
ADD COLUMN     "passwordResetOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetOtpHash" TEXT;
