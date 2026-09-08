-- Preserve existing assignments as outbound rides.
CREATE TYPE "RideDirection" AS ENUM ('OUTBOUND', 'RETURN');

ALTER TABLE "RideAssignment" ADD COLUMN "direction" "RideDirection" NOT NULL DEFAULT 'OUTBOUND';

DROP INDEX "RideAssignment_eventId_passengerId_key";
CREATE UNIQUE INDEX "RideAssignment_eventId_passengerId_direction_key"
    ON "RideAssignment"("eventId", "passengerId", "direction");
