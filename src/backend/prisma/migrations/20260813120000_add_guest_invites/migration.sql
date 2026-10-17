-- AlterTable
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GuestInviteToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestInviteToken_tokenHash_key" ON "GuestInviteToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "GuestInviteToken_userId_key" ON "GuestInviteToken"("userId");

-- CreateIndex
CREATE INDEX "GuestInviteToken_eventId_idx" ON "GuestInviteToken"("eventId");

-- AddForeignKey
ALTER TABLE "GuestInviteToken" ADD CONSTRAINT "GuestInviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestInviteToken" ADD CONSTRAINT "GuestInviteToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
