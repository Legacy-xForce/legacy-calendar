import { NotificationCode, type NotificationSettings } from '../types/Notification';

const knownCodes = new Set(Object.values(NotificationCode));

export function isKnownNotificationCode(value: unknown): value is NotificationCode {
    return typeof value === 'string' && knownCodes.has(value as NotificationCode);
}

export function shouldSuppressNotification(type: string | undefined, settings: NotificationSettings): boolean {
    if (!isKnownNotificationCode(type)) {
        return false;
    }

    return settings[type] === false;
}

export function resolveNotificationRoute(type: string | undefined, eventId: string | undefined): string {
    const trimmedEventId = eventId?.trim();

    if (!trimmedEventId) {
        return '/';
    }

    if (type === 'CHAT_NEW_MESSAGE') {
        return `/event/${encodeURIComponent(trimmedEventId)}/chat`;
    }

    if (isKnownNotificationCode(type)) {
        return `/event/${encodeURIComponent(trimmedEventId)}`;
    }

    return '/';
}
