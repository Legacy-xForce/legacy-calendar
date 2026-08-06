export interface CreateEventDto {
    title: string;
    color?: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime?: string;
    participants?: number[];
    isOpen: boolean;
    isPrivate: boolean;
    hasFood?: boolean;
    hasWeed?: boolean;
    hasSleep?: boolean;
    hasAlcohol?: boolean;
    hasBeer?: boolean;
    foodPrice?: number;
    weedPrice?: number;
    sleepPrice?: number;
    alcoholPrice?: number;
    beerPrice?: number;
    participationDeadline?: string;
}

export const EVENT_FEATURES = ['FOOD', 'WEED', 'ALCOHOL', 'SLEEP', 'BEER'] as const;
export type EventFeature = (typeof EVENT_FEATURES)[number];

export const PARTICIPANT_STATUSES = ['ACCEPTED', 'DECLINED', 'PENDING'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const TRANSPORT_MODES = ['NEEDS_RIDE', 'SELF', 'DRIVER'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export interface EventPersonSummary {
    id: number;
    username: string;
    profilePictureUrl?: string | null;
}

export interface EventParticipant extends EventPersonSummary {
    status: ParticipantStatus | string;
    wantsFood?: boolean;
    wantsWeed?: boolean;
    wantsSleep?: boolean;
    wantsAlcohol?: boolean;
    wantsBeer?: boolean;
    transportMode?: TransportMode;
    vehicleSeats?: number;
    driverId?: number;
    driver?: EventPersonSummary;
}

export interface Event {
    id: number;
    title: string;
    color?: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime?: string;
    hostId?: number;
    host?: EventPersonSummary;
    participants?: EventParticipant[];
    isOpen: boolean;
    isPrivate: boolean;
    hasFood?: boolean;
    hasWeed?: boolean;
    hasSleep?: boolean;
    hasAlcohol?: boolean;
    hasBeer?: boolean;
    foodPrice?: number;
    weedPrice?: number;
    sleepPrice?: number;
    alcoholPrice?: number;
    beerPrice?: number;
    participationDeadline?: string;
}

export interface ParticipateDto {
    wantsFood?: boolean;
    wantsWeed?: boolean;
    wantsSleep?: boolean;
    wantsAlcohol?: boolean;
    wantsBeer?: boolean;
    transportMode?: TransportMode;
    vehicleSeats?: number;
}
