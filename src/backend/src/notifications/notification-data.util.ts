import { NotificationCode } from './notification-codes.js';

/**
 * FCM data payloads are string-only maps. Centralised so events, invites and
 * chat notifications emit a consistent shape.
 */
export function buildNotificationData(input: {
    type: NotificationCode;
    eventId: number | string;
    actorUsername?: string;
    messageId?: number | string;
}): Record<string, string> {
    const data: Record<string, string> = {
        type: input.type,
        eventId: String(input.eventId)
    };

    if (input.actorUsername) {
        data.actorUsername = input.actorUsername;
    }

    if (input.messageId !== undefined) {
        data.messageId = String(input.messageId);
    }

    return data;
}
