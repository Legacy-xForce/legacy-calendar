# Guest identity separation and migration plan

## Current failure

Guest invites create `User` rows with `isGuest = true`. The guest's chosen display name is written to `User.username`, which is globally unique. `UsersService.syncFromAuth()` currently looks up by username and links any row without an `authId`; that lets an authenticated identity claim a guest row. Guests are also coupled to user ids by attendance, invite tokens, audit actors, and event response mapping.

## Implemented target model

Guests are event scoped and never represented by `User`:

- `GuestParticipant` (id, displayName, createdAt) is the identity for one guest invite; expiration remains on its `GuestInviteToken`.
- Make `GuestInviteToken` reference `guestParticipantId`, and keep the token hash and event id on the invite.
- Change `Attendance` to allow either `userId` or `guestParticipantId`, with a database check constraint requiring exactly one identity and unique indexes for `(userId,eventId)` and `(guestParticipantId,eventId)`.
- Event response mapping returns the same participant DTO shape for either identity. Guest IDs are negative in the existing `id` field, reserving positive IDs for real users. Ride assignments use that same signed ID namespace; payment and co-host endpoints remain user-only.
- Guest audit entries use a nullable user actor plus a guest actor reference and a durable actor-name snapshot. Guest participants cannot create chat messages, reactions, co-hosts, passkeys, user groups, or push subscriptions unless those features are explicitly redesigned for guests.
- Auth synchronization only resolves real users by `authId` and non-guest username. It never searches or mutates guest records.

## Migration behavior

The migration `20260910120000_separate_guest_participants` performs an atomic backfill and contract. Apply it with a backup and while app instances are stopped or deployed together: old application versions require the removed `User.isGuest` and `GuestInviteToken.userId` columns.

The migration preserves existing guest IDs in `GuestParticipant`, attendee names, attendance, invite tokens, ride assignments, and audit actor names. Guest references in ride assignments and audit payloads are converted to negative IDs. If a legacy guest row already has an `authId` from the old username merge, the migration keeps that row as the real authenticated user and detaches the guest's event data from it. Only unclaimed guest rows are deleted. A preflight guard fails if an unclaimed guest still owns data in unrelated tables, rather than silently deleting or orphaning it. The migration then drops the legacy columns and adds an attendance XOR check constraint.

Before applying in production, back up the database, verify guest attendance/token/audit counts, inspect any FK references to `User.isGuest` rows outside attendance/token/audit/rides, then apply the migration and confirm authenticated identities survived and guest data moved. The current migration is transactional; rollback is a database restore.

Auth synchronization now only sees real users. A guest may choose the same display name as a real account without either identity being linked or the name constraint being violated.
