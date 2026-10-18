-- Speed up the calendar range query (`startTime` between start/end) and the
-- per-user visibility lookups. Both columns are filtered on every calendar load
-- and had no index, forcing sequential scans as the table grows.
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");
CREATE INDEX "Event_hostId_idx" ON "Event"("hostId");
