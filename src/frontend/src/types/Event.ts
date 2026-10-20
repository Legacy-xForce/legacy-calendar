import type { components } from './api.generated';

type ApiSchemas = components['schemas'];
type ApiUser = ApiSchemas['UserDto'];
type ApiParticipant = ApiSchemas['EventParticipantDto'];
type ApiEvent = ApiSchemas['EventResponseDto'];
type ApiCreateEvent = ApiSchemas['CreateEventDto'];

// Generated from the backend's OpenAPI document (`bun run generate:api`).
// A few nullable API fields are normalised to the optional shapes the UI uses.
export type CreateEventDto = Omit<ApiCreateEvent, 'isOpen' | 'isPrivate'> & {
    isOpen: boolean;
    isPrivate: boolean;
};
export type ParticipateDto = ApiSchemas['ParticipateDto'];

export const EVENT_FEATURES = ['FOOD', 'WEED', 'ALCOHOL', 'SLEEP', 'BEER'] as const;
export type EventFeature = (typeof EVENT_FEATURES)[number];

export const PARTICIPANT_STATUSES = ['ACCEPTED', 'DECLINED', 'PENDING'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const TRANSPORT_MODES = ['NEEDS_RIDE', 'SELF', 'DRIVER'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export type RideDirection = 'OUTBOUND' | 'RETURN';

export interface FeatureSelectionResult {
    features: EventFeature[];
    transport: {
        transportMode: TransportMode;
        vehicleSeats?: number;
        vehicleSeatsOutbound?: number;
        vehicleSeatsReturn?: number;
    };
}

export type EventPersonSummary = Pick<ApiUser, 'id' | 'username'> &
    Partial<Pick<ApiUser, 'profilePictureUrl' | 'paypalLink' | 'ibanNumber' | 'ibanAccountHolder' | 'revolutLink'>>;

export type EventParticipant = EventPersonSummary &
    Omit<ApiParticipant, keyof EventPersonSummary | 'driver' | 'driverReturn'> & {
        driver?: EventPersonSummary;
        driverReturn?: EventPersonSummary;
    };

export type Event = Omit<
    ApiEvent,
    | 'color'
    | 'description'
    | 'location'
    | 'participationDeadline'
    | 'foodPrice'
    | 'weedPrice'
    | 'sleepPrice'
    | 'alcoholPrice'
    | 'beerPrice'
    | 'host'
    | 'coHosts'
    | 'participants'
> & {
    color?: string;
    description?: string;
    location?: string;
    participationDeadline?: string;
    foodPrice?: number;
    weedPrice?: number;
    sleepPrice?: number;
    alcoholPrice?: number;
    beerPrice?: number;
    host?: EventPersonSummary;
    coHosts?: EventPersonSummary[];
    participants?: EventParticipant[];
};
