export const NotificationCode = {
    INVITATION_NEW: 'INVITATION_NEW',
    EVENT_CREATED: 'EVENT_CREATED',
    EVENT_UPDATED: 'EVENT_UPDATED',
    EVENT_CANCELLED: 'EVENT_CANCELLED',
    PARTICIPATION_ACCEPTED: 'PARTICIPATION_ACCEPTED',
    PARTICIPATION_UPDATED: 'PARTICIPATION_UPDATED',
    PARTICIPATION_CANCELLED: 'PARTICIPATION_CANCELLED',
    RIDE_ASSIGNED: 'RIDE_ASSIGNED',
    CHAT_NEW_MESSAGE: 'CHAT_NEW_MESSAGE'
} as const;

export type NotificationCode = (typeof NotificationCode)[keyof typeof NotificationCode];

export type NotificationSettings = Record<NotificationCode, boolean>;
