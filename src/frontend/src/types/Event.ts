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

/** An instance-wide feature (name + emoji) an admin has defined. */
export type Feature = ApiSchemas['FeatureDto'];
/** A feature enabled on one event, with that event's optional budget. */
export type EventFeatureEntry = ApiSchemas['EventFeatureDto'];
export type FeatureId = number;
export type CreateFeatureDto = ApiSchemas['CreateFeatureDto'];
export type UpdateFeatureDto = ApiSchemas['UpdateFeatureDto'];

export const PARTICIPANT_STATUSES = ['ACCEPTED', 'DECLINED', 'PENDING'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const TRANSPORT_MODES = ['NEEDS_RIDE', 'SELF', 'DRIVER'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export type RideDirection = 'OUTBOUND' | 'RETURN';

export interface FeatureSelectionResult {
    features: FeatureId[];
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
    'color' | 'description' | 'location' | 'participationDeadline' | 'host' | 'coHosts' | 'participants'
> & {
    color?: string;
    description?: string;
    location?: string;
    participationDeadline?: string;
    host?: EventPersonSummary;
    coHosts?: EventPersonSummary[];
    participants?: EventParticipant[];
};
