-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'STARTER', 'PRO');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" "PlanType" NOT NULL DEFAULT 'FREE';
