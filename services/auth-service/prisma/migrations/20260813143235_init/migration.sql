-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'TENANT_OWNER', 'SUPPORT_AGENT', 'CUSTOMER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'TENANT_OWNER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationTokenHash" TEXT,
    "emailVerificationExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_emailVerificationTokenHash_idx" ON "users"("emailVerificationTokenHash");

-- CreateIndex
CREATE INDEX "users_passwordResetTokenHash_idx" ON "users"("passwordResetTokenHash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
