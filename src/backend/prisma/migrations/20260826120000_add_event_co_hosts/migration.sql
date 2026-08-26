-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'CO_HOST_ADDED';
ALTER TYPE "ActionType" ADD VALUE 'CO_HOST_REMOVED';

-- CreateTable
CREATE TABLE "EventCoHost" (
    "eventId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCoHost_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "EventCoHost_eventId_idx" ON "EventCoHost"("eventId");

-- AddForeignKey
ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCoHost" ADD CONSTRAINT "EventCoHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
