/**
 * Participant ids are namespaced in one numeric space:
 * registered users use their positive `userId`, while magic-link guests use the
 * negative `guestParticipantId` (`-guestParticipantId`). This lets invitations,
 * ride assignments and audit entries reference either kind with one integer and
 * guarantees a guest id can never collide with a user id.
 */

/** Namespaced id for an attendance row. */
export function attendanceId(attendance: {
    userId: number | null;
    guestParticipantId?: number | null;
}): number {
    if (attendance.userId !== null) return attendance.userId;
    return guestId(attendance.guestParticipantId ?? 0);
}

/** Namespaced id for a guest participant row. */
export function guestId(guestParticipantId: number): number {
    return -guestParticipantId;
}

/** Underlying guestParticipantId for a namespaced id; users pass through unchanged. */
export function guestParticipantIdOf(participantId: number): number {
    return participantId < 0 ? -participantId : participantId;
}
