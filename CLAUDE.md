# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Database (production)

Production data lives in a self-hosted Postgres container (`legacy-calendar-db`, image `postgres:17-alpine`) on the VPS `ubuntu@caccabot.duckdns.org`, in the compose project `~/legacy` (volume `legacy_calendar_pgdata`). It replaced Neon; any Neon URL still in a local `.env` is stale.

- **No published port.** The DB is reachable only inside the Docker network (host `calendar-db`, port 5432, database `legacy_calendar`, user `legacy_calendar`). Reach it by exec'ing into the container over SSH; do not open the port or add a `ports:` entry.
- **Credentials are never in this repo.** The password is in `~/legacy/.env` on the VPS (`CALENDAR_DB_PASSWORD`) and in `~/legacy/calendar/.env` (`DATABASE_URL`). Do not print, log or commit them. SSH access is the user's to grant; ask for it rather than guessing credentials.
- **Interactive query** (the login shell is fish, so wrap in `bash -c`):
  `ssh ubuntu@caccabot.duckdns.org 'docker exec legacy-calendar-db psql -U legacy_calendar -d legacy_calendar -c "select count(*) from ..."'`
- **Read first.** Prefer `select` and `\dt` / `\d <table>`. This is the live production database, so for any `insert/update/delete`, DDL or restore, state the exact statement and get the user's confirmation first, and run it in a transaction you can roll back.
- **Backup before risky changes:**
  `ssh ubuntu@caccabot.duckdns.org 'docker exec legacy-calendar-db pg_dump -U legacy_calendar -Fc legacy_calendar' > calendar-$(date +%F).dump`
  There are no automated backups yet. Never run `docker compose down -v` or `docker volume rm` in `~/legacy`; that deletes the data.
- **Schema:** managed by Prisma (`src/backend/prisma/schema.prisma`, migrations in `src/backend/prisma/migrations/`). Add changes as new migrations; never hand-edit production tables. `DATABASE_URL` ends in `?schema=public`.
- **Local development must not use the production DB.** Use a throwaway Postgres (e.g. PGlite or a local container) via `DATABASE_URL`.
