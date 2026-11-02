-- AlterTable
ALTER TABLE "Feature" ADD COLUMN "eventId" INTEGER;

-- AlterTable
ALTER TABLE "EventFeature" ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "eligibleUserIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Catalog features (eventId IS NULL) stay globally unique; one-time features
-- are unique per event only.
DROP INDEX "Feature_nameKey_key";
DROP INDEX "Feature_emoji_key";
CREATE UNIQUE INDEX "Feature_catalog_nameKey_key" ON "Feature"("nameKey") WHERE "eventId" IS NULL;
CREATE UNIQUE INDEX "Feature_catalog_emoji_key" ON "Feature"("emoji") WHERE "eventId" IS NULL;
CREATE UNIQUE INDEX "Feature_eventId_nameKey_key" ON "Feature"("eventId", "nameKey");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
