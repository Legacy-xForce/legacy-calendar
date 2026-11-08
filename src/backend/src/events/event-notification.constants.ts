export const EVENT_NOTIFICATION_TITLES = {
    invitationNew: 'New Invitation',
    eventCreated: 'New Event',
    eventUpdated: 'Event Updated',
    eventCancelled: 'Event Cancelled',
    participationAccepted: 'Invite Accepted',
    participationUpdated: 'Participation Updated',
    participationCancelled: 'Participation Cancelled',
    rideAssigned: 'Ride Assigned'
} as const;

export const EVENT_NOTIFICATION_MESSAGES = {
    invitationNew: (actorUsername: string, eventTitle: string) => `${actorUsername} invited you to ${eventTitle}`,
    eventCreated: (actorUsername: string, eventTitle: string) => `${actorUsername} created a new event: ${eventTitle}`,
    eventUpdated: (eventTitle: string, changes: string[] = []) =>
        changes.length > 0
            ? `Event "${eventTitle}" has been updated: ${changes.join('; ')}.`
            : `Event "${eventTitle}" has been updated.`,
    eventCancelled: (eventTitle: string) => `Event "${eventTitle}" has been cancelled.`,
    participationAccepted: (username: string, eventTitle: string) =>
        `${username} has accepted your invitation to "${eventTitle}"`,
    participationUpdated: (username: string, eventTitle: string) =>
        `${username} has updated their preferences for "${eventTitle}"`,
    participationCancelled: (username: string, eventTitle: string) =>
        `${username} has cancelled their participation in "${eventTitle}"`,
    rideAssigned: (actorUsername: string, eventTitle: string) =>
        `${actorUsername} assigned you to a ride for ${eventTitle}`
} as const;

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

const formatDateTime = (value: unknown) => {
    const text = asText(value);
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const quoted = (value: unknown) => (value ? `"${asText(value)}"` : 'none');

/** Turns a changed event field into a short human readable phrase, or null for fields not worth announcing. */
export function describeEventFieldChange(field: string, value: unknown): string | null {
    switch (field) {
        case 'title':
            return `title is now ${quoted(value)}`;
        case 'description':
            return 'description changed';
        case 'location':
            return `location is now ${quoted(value)}`;
        case 'startTime':
            return `starts at ${formatDateTime(value)}`;
        case 'endTime':
            return value ? `ends at ${formatDateTime(value)}` : 'end time removed';
        case 'participationDeadline':
            return value ? `RSVP deadline is ${formatDateTime(value)}` : 'RSVP deadline removed';
        case 'features':
            return value ? `features are now ${asText(value)}` : 'features removed';
        case 'isOpen':
            return value ? 'event is now open' : 'event is now closed';
        case 'isPrivate':
            return value ? 'event is now private' : 'event is now public';
        case 'color':
            return 'color changed';
        default:
            return null;
    }
}
