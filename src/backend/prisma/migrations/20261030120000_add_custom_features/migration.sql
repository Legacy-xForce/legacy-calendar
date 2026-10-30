-- CreateTable
CREATE TABLE "Feature" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFeature" (
    "eventId" INTEGER NOT NULL,
    "featureId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION,

    CONSTRAINT "EventFeature_pkey" PRIMARY KEY ("eventId","featureId")
);

-- CreateTable
CREATE TABLE "AttendanceFeature" (
    "attendanceId" INTEGER NOT NULL,
    "featureId" INTEGER NOT NULL,

    CONSTRAINT "AttendanceFeature_pkey" PRIMARY KEY ("attendanceId","featureId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feature_nameKey_key" ON "Feature"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_emoji_key" ON "Feature"("emoji");

-- CreateIndex
CREATE INDEX "EventFeature_featureId_idx" ON "EventFeature"("featureId");

-- CreateIndex
CREATE INDEX "AttendanceFeature_featureId_idx" ON "AttendanceFeature"("featureId");

-- AddForeignKey
ALTER TABLE "EventFeature" ADD CONSTRAINT "EventFeature_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFeature" ADD CONSTRAINT "EventFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceFeature" ADD CONSTRAINT "AttendanceFeature_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceFeature" ADD CONSTRAINT "AttendanceFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the five previously hard-coded features
INSERT INTO "Feature" ("name", "nameKey", "emoji") VALUES
    ('Food', 'food', '🍗'),
    ('Weed', 'weed', '🌿'),
    ('Alcohol', 'alcohol', '🍾'),
    ('Beer', 'beer', '🍺'),
    ('Sleep', 'sleep', '🌙');

-- Carry over what events offered (and their budgets)
INSERT INTO "EventFeature" ("eventId", "featureId", "price")
SELECT e."id", f."id", CASE f."nameKey"
        WHEN 'food' THEN e."foodPrice"
        WHEN 'weed' THEN e."weedPrice"
        WHEN 'alcohol' THEN e."alcoholPrice"
        WHEN 'beer' THEN e."beerPrice"
        WHEN 'sleep' THEN e."sleepPrice"
    END
FROM "Event" e
JOIN "Feature" f ON (
    (f."nameKey" = 'food' AND e."hasFood") OR
    (f."nameKey" = 'weed' AND e."hasWeed") OR
    (f."nameKey" = 'alcohol' AND e."hasAlcohol") OR
    (f."nameKey" = 'beer' AND e."hasBeer") OR
    (f."nameKey" = 'sleep' AND e."hasSleep")
);

-- Carry over what participants opted into
INSERT INTO "AttendanceFeature" ("attendanceId", "featureId")
SELECT a."id", f."id"
FROM "Attendance" a
JOIN "Feature" f ON (
    (f."nameKey" = 'food' AND a."wantsFood") OR
    (f."nameKey" = 'weed' AND a."wantsWeed") OR
    (f."nameKey" = 'alcohol' AND a."wantsAlcohol") OR
    (f."nameKey" = 'beer' AND a."wantsBeer") OR
    (f."nameKey" = 'sleep' AND a."wantsSleep")
);

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "hasAlcohol", DROP COLUMN "hasFood", DROP COLUMN "hasSleep", DROP COLUMN "hasWeed", DROP COLUMN "hasBeer",
DROP COLUMN "alcoholPrice", DROP COLUMN "beerPrice", DROP COLUMN "foodPrice", DROP COLUMN "sleepPrice", DROP COLUMN "weedPrice";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "wantsAlcohol", DROP COLUMN "wantsFood", DROP COLUMN "wantsSleep", DROP COLUMN "wantsWeed", DROP COLUMN "wantsBeer";
