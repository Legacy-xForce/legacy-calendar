/**
 * Pure access predicates over the loaded event graph. Each caller keeps its own
 * fetch and status rules; only the boolean logic is shared here.
 */

type EventAccessShape = {
    hostId: number;
    coHosts: Array<{ userId: number }>;
    participants: Array<{ userId: number | null; status: string }>;
};

export function isEventHost(event: Pick<EventAccessShape, 'hostId'>, userId: number): boolean {
    return event.hostId === userId;
}

/** Host or one of the event's co-hosts. */
export function isEventManager(event: EventAccessShape, userId: number): boolean {
    return event.hostId === userId || event.coHosts.some((coHost) => coHost.userId === userId);
}

/** Any participant; pass `acceptedOnly` to require an accepted RSVP. */
export function isEventParticipant(
    event: Pick<EventAccessShape, 'participants'>,
    userId: number,
    options: { acceptedOnly?: boolean } = {}
): boolean {
    return event.participants.some(
        (participant) => participant.userId === userId && (!options.acceptedOnly || participant.status === 'ACCEPTED')
    );
}
