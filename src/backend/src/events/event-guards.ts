import { ForbiddenException } from '@nestjs/common';

type EventTiming = {
    endTime: Date | null;
    participationDeadline: Date | null;
};

/**
 * Shared timing guards for event mutations. Guest invites and authenticated
 * event endpoints previously re-implemented these checks with slightly
 * different wording, so the message stays configurable.
 */
export function assertEventNotEnded(
    event: EventTiming,
    message = 'This event has already ended and cannot be modified'
): void {
    if (event.endTime && new Date() > event.endTime) {
        throw new ForbiddenException(message);
    }
}

export function assertDeadlineNotPassed(
    event: EventTiming,
    message = 'The participation deadline for this event has passed'
): void {
    if (event.participationDeadline && new Date() > event.participationDeadline) {
        throw new ForbiddenException(message);
    }
}
