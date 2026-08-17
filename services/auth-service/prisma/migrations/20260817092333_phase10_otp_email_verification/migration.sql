-- DropIndex
DROP INDEX "users_emailVerificationTokenHash_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "emailVerificationExpiresAt",
DROP COLUMN "emailVerificationTokenHash",
ADD COLUMN     "emailVerificationOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerificationOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationOtpHash" TEXT,
ADD COLUMN     "emailVerificationOtpLastSentAt" TIMESTAMP(3);
