-- Move event-scoped guests out of User while preserving their ids and history.
CREATE TABLE "GuestParticipant" (
    "id" SERIAL NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT 'Guest',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestParticipant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Attendance" ADD COLUMN "guestParticipantId" INTEGER;
ALTER TABLE "GuestInviteToken" ADD COLUMN "guestParticipantId" INTEGER;
ALTER TABLE "AuditLogEntry" ADD COLUMN "actorGuestParticipantId" INTEGER;
ALTER TABLE "AuditLogEntry" ADD COLUMN "actorName" TEXT;
ALTER TABLE "Attendance" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AuditLogEntry" ALTER COLUMN "actorId" DROP NOT NULL;

-- Reuse legacy user ids so invite URLs and guest participant ids remain stable.
INSERT INTO "GuestParticipant" ("id", "displayName", "createdAt")
SELECT u."id", u."username", CURRENT_TIMESTAMP
FROM "User" u
WHERE u."isGuest" = true OR EXISTS (
    SELECT 1 FROM "GuestInviteToken" t WHERE t."userId" = u."id"
);
SELECT setval(pg_get_serial_sequence('"GuestParticipant"', 'id'),
              GREATEST(COALESCE((SELECT MAX("id") FROM "GuestParticipant"), 1), 1),
              EXISTS (SELECT 1 FROM "GuestParticipant"));

UPDATE "Attendance" AS a
SET "guestParticipantId" = u."id", "userId" = NULL
FROM "User" AS u
WHERE a."userId" = u."id"
  AND (
      u."isGuest" = true
      OR EXISTS (
          SELECT 1 FROM "GuestInviteToken" t
          WHERE t."userId" = u."id" AND t."eventId" = a."eventId"
      )
  );

UPDATE "GuestInviteToken" AS t
SET "guestParticipantId" = u."id"
FROM "User" AS u
WHERE t."userId" = u."id";

UPDATE "AuditLogEntry" AS a
SET "actorGuestParticipantId" = u."id", "actorName" = u."username", "actorId" = NULL
FROM "User" AS u
WHERE a."actorId" = u."id"
  AND u."isGuest" = true
  AND u."authId" IS NULL;

UPDATE "AuditLogEntry" AS a
SET "actorGuestParticipantId" = u."id", "actorName" = u."username", "actorId" = NULL
FROM "User" AS u
WHERE a."actorId" = u."id"
  AND EXISTS (
      SELECT 1 FROM "GuestInviteToken" AS t
      WHERE t."userId" = u."id" AND t."eventId" = a."eventId"
  );

-- Use negative ids in audit payloads for guest references so they cannot be
-- mistaken for real user ids after the legacy rows are deleted.
UPDATE "AuditLogEntry" AS a
SET "payloadDiff" = jsonb_set(
    jsonb_set(a."payloadDiff", '{before,userId}', to_jsonb(-u."id"), false),
    '{after,userId}', to_jsonb(-u."id"), false
)
FROM "User" AS u
WHERE (
      u."isGuest" = true OR EXISTS (
          SELECT 1 FROM "GuestInviteToken" AS t
          WHERE t."userId" = u."id" AND t."eventId" = a."eventId"
      )
  )
  AND (
      a."payloadDiff"->'before'->>'userId' = u."id"::text
      OR a."payloadDiff"->'after'->>'userId' = u."id"::text
  );

ALTER TABLE "GuestInviteToken" ALTER COLUMN "guestParticipantId" SET NOT NULL;

ALTER TABLE "GuestInviteToken" DROP CONSTRAINT "GuestInviteToken_userId_fkey";
DROP INDEX "GuestInviteToken_userId_key";
ALTER TABLE "GuestInviteToken" DROP COLUMN "userId";
ALTER TABLE "GuestInviteToken" ADD CONSTRAINT "GuestInviteToken_guestParticipantId_fkey"
    FOREIGN KEY ("guestParticipantId") REFERENCES "GuestParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestInviteToken" ADD CONSTRAINT "GuestInviteToken_guestParticipantId_key" UNIQUE ("guestParticipantId");

-- Ride assignment ids use the same positive-user / negative-guest namespace as
-- event participants. Remove the user-only foreign keys before converting ids.
ALTER TABLE "RideAssignment" DROP CONSTRAINT "RideAssignment_driverId_fkey";
ALTER TABLE "RideAssignment" DROP CONSTRAINT "RideAssignment_passengerId_fkey";
UPDATE "RideAssignment" AS r
SET "driverId" = -u."id"
FROM "User" AS u
WHERE r."driverId" = u."id"
  AND (u."isGuest" = true OR EXISTS (
      SELECT 1 FROM "GuestInviteToken" AS t
      WHERE t."guestParticipantId" = u."id" AND t."eventId" = r."eventId"
  ));
UPDATE "RideAssignment" AS r
SET "passengerId" = -u."id"
FROM "User" AS u
WHERE r."passengerId" = u."id"
  AND (u."isGuest" = true OR EXISTS (
      SELECT 1 FROM "GuestInviteToken" AS t
      WHERE t."guestParticipantId" = u."id" AND t."eventId" = r."eventId"
  ));

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_guestParticipantId_eventId_key" UNIQUE ("guestParticipantId", "eventId");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_guestParticipantId_fkey"
    FOREIGN KEY ("guestParticipantId") REFERENCES "GuestParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_identity_check"
    CHECK (("userId" IS NOT NULL AND "guestParticipantId" IS NULL) OR ("userId" IS NULL AND "guestParticipantId" IS NOT NULL));

ALTER TABLE "AuditLogEntry" DROP CONSTRAINT "AuditLogEntry_actorId_fkey";
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorGuestParticipantId_fkey"
    FOREIGN KEY ("actorGuestParticipantId") REFERENCES "GuestParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep rows already claimed by an auth identity as real users. Their guest
-- attendance/invites have been detached above, but their account must survive.
UPDATE "User" SET "isGuest" = false WHERE "isGuest" = true AND "authId" IS NOT NULL;

-- Fail rather than silently cascade-delete data for unclaimed guest rows.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."isGuest" = true AND u."authId" IS NULL
          AND (
              EXISTS (SELECT 1 FROM "FcmToken" x WHERE x."userId" = u."id")
              OR EXISTS (SELECT 1 FROM "EventCoHost" x WHERE x."userId" = u."id")
              OR EXISTS (SELECT 1 FROM "ChatMessage" x WHERE x."authorId" = u."id")
              OR EXISTS (SELECT 1 FROM "ChatReaction" x WHERE x."userId" = u."id")
              OR EXISTS (SELECT 1 FROM "ChatMute" x WHERE x."userId" = u."id")
              OR EXISTS (SELECT 1 FROM "UserGroup" x WHERE x."userId" = u."id")
              OR EXISTS (SELECT 1 FROM "PasskeyCredential" x WHERE x."userId" = u."id")
          )
    ) THEN
        RAISE EXCEPTION 'Unclaimed guest users still own data outside attendance, invites, or audit; migrate those references before retrying';
    END IF;
END $$;

DELETE FROM "User" WHERE "isGuest" = true AND "authId" IS NULL;
ALTER TABLE "User" DROP COLUMN "isGuest";
