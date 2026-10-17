import type { Event, ParticipateDto } from './Event';

export interface CreateGuestInviteResponse {
    url: string;
    guestUserId: number;
    expiresAt: string;
}

export interface GuestInviteResponse {
    event: Event;
    guestUserId: number;
    isDeadlinePassed: boolean;
    canEdit: boolean;
}

export interface GuestParticipateDto extends ParticipateDto {
    username?: string;
}
