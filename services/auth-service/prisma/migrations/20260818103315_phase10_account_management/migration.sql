-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "customer_join_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_join_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_join_links_organizationId_key" ON "customer_join_links"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_join_links_token_key" ON "customer_join_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "customer_join_links_code_key" ON "customer_join_links"("code");

-- AddForeignKey
ALTER TABLE "customer_join_links" ADD CONSTRAINT "customer_join_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
