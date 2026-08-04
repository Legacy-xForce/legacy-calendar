-- AlterTable
ALTER TABLE "User" ADD COLUMN "authId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");
