import type { CreateEventDto, Event, EventFeature, EventParticipant, ParticipantStatus } from '../types/Event';
import { EVENT_FEATURES } from '../types/Event';

const MAX_EVENT_START_TIME_YEARS_AHEAD = 1;

export const FEATURE_FLAG_FIELD: Record<
    EventFeature,
    keyof Pick<CreateEventDto, 'hasFood' | 'hasWeed' | 'hasSleep' | 'hasAlcohol' | 'hasBeer'>
> = {
    FOOD: 'hasFood',
    WEED: 'hasWeed',
    ALCOHOL: 'hasAlcohol',
    SLEEP: 'hasSleep',
    BEER: 'hasBeer'
};

export const FEATURE_PRICE_FIELD: Record<
    EventFeature,
    keyof Pick<CreateEventDto, 'foodPrice' | 'weedPrice' | 'sleepPrice' | 'alcoholPrice' | 'beerPrice'>
> = {
    FOOD: 'foodPrice',
    WEED: 'weedPrice',
    ALCOHOL: 'alcoholPrice',
    SLEEP: 'sleepPrice',
    BEER: 'beerPrice'
};

export const PARTICIPANT_WANTS_FIELD: Record<
    EventFeature,
    keyof Pick<EventParticipant, 'wantsFood' | 'wantsWeed' | 'wantsSleep' | 'wantsAlcohol' | 'wantsBeer'>
> = {
    FOOD: 'wantsFood',
    WEED: 'wantsWeed',
    ALCOHOL: 'wantsAlcohol',
    SLEEP: 'wantsSleep',
    BEER: 'wantsBeer'
};

export const PARTICIPANT_STATUS_SEVERITY: Record<ParticipantStatus, 'success' | 'danger' | 'warn'> = {
    ACCEPTED: 'success',
    DECLINED: 'danger',
    PENDING: 'warn'
};

export const PARTICIPANT_STATUS_ICON: Record<ParticipantStatus, string> = {
    ACCEPTED: 'pi pi-check',
    DECLINED: 'pi pi-times',
    PENDING: 'pi pi-clock'
};

export function createFeatureRecord<T>(factory: (feature: EventFeature) => T): Record<EventFeature, T> {
    return {
        FOOD: factory('FOOD'),
        WEED: factory('WEED'),
        ALCOHOL: factory('ALCOHOL'),
        SLEEP: factory('SLEEP'),
        BEER: factory('BEER')
    };
}

export function toggleFeature(features: EventFeature[], feature: EventFeature) {
    const index = features.indexOf(feature);
    if (index === -1) {
        features.push(feature);
        return;
    }

    features.splice(index, 1);
}

export function combineDateAndTime(datePart: Date, timePart: Date): Date {
    const combined = new Date(datePart);
    combined.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
    return combined;
}

function startOfDay(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
}

function endOfDay(date: Date) {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
}

export function getEventStartDateBounds(referenceDate = new Date()) {
    const minDate = startOfDay(referenceDate);
    const maxDate = new Date(referenceDate);
    maxDate.setFullYear(maxDate.getFullYear() + MAX_EVENT_START_TIME_YEARS_AHEAD);

    return {
        minDate,
        maxDate: endOfDay(maxDate)
    };
}

export function isEventStartTimeWithinAllowedRange(startTime: Date, referenceDate = new Date()) {
    const { minDate, maxDate } = getEventStartDateBounds(referenceDate);
    return startTime >= minDate && startTime <= maxDate;
}

export function selectedFeaturesFromEvent(
    event: Pick<Event, 'hasFood' | 'hasWeed' | 'hasSleep' | 'hasAlcohol' | 'hasBeer'> | null | undefined
): EventFeature[] {
    if (!event) return [];

    return EVENT_FEATURES.filter((feature) => event[FEATURE_FLAG_FIELD[feature]] === true);
}

export function featureFlagsFromSelection(features: EventFeature[]) {
    return {
        hasFood: features.includes('FOOD'),
        hasWeed: features.includes('WEED'),
        hasSleep: features.includes('SLEEP'),
        hasAlcohol: features.includes('ALCOHOL'),
        hasBeer: features.includes('BEER')
    };
}

export function participantWantsFromSelection(features: EventFeature[]) {
    return {
        wantsFood: features.includes('FOOD'),
        wantsWeed: features.includes('WEED'),
        wantsSleep: features.includes('SLEEP'),
        wantsAlcohol: features.includes('ALCOHOL'),
        wantsBeer: features.includes('BEER')
    };
}

export function featurePricesFromEvent(
    event: Pick<Event, 'foodPrice' | 'weedPrice' | 'sleepPrice' | 'alcoholPrice' | 'beerPrice'> | null | undefined
) {
    return createFeatureRecord((feature) => {
        if (!event) return null;
        const value = event[FEATURE_PRICE_FIELD[feature]];
        return typeof value === 'number' ? value : null;
    });
}

export function participantFeatures(
    participant:
        | Pick<EventParticipant, 'wantsFood' | 'wantsWeed' | 'wantsSleep' | 'wantsAlcohol' | 'wantsBeer'>
        | null
        | undefined
): EventFeature[] {
    if (!participant) return [];

    return EVENT_FEATURES.filter((feature) => participant[PARTICIPANT_WANTS_FIELD[feature]] === true);
}

export function featureCount(participants: EventParticipant[], feature: EventFeature) {
    const wantsField = PARTICIPANT_WANTS_FIELD[feature];
    return participants.filter((participant) => participant.status === 'ACCEPTED' && participant[wantsField]).length;
}

export function featureSplitPrice(
    event: Pick<Event, 'foodPrice' | 'weedPrice' | 'sleepPrice' | 'alcoholPrice' | 'beerPrice'> | null | undefined,
    participants: EventParticipant[],
    feature: EventFeature
) {
    if (!event) return 0;

    const price = event[FEATURE_PRICE_FIELD[feature]] ?? 0;
    if (!price) return 0;

    const count = featureCount(participants, feature);
    return count > 0 ? price / count : price;
}

export function totalEventBudget(
    event: Pick<Event, 'foodPrice' | 'weedPrice' | 'sleepPrice' | 'alcoholPrice' | 'beerPrice'> | null | undefined
) {
    if (!event) return 0;

    return (
        (event.foodPrice ?? 0) +
        (event.weedPrice ?? 0) +
        (event.sleepPrice ?? 0) +
        (event.alcoholPrice ?? 0) +
        (event.beerPrice ?? 0)
    );
}

export function canUserRespondToEvent(args: {
    isHost: boolean;
    userParticipantStatus: string | null;
    isOpen: boolean;
}) {
    if (args.isHost) return true;
    if (args.userParticipantStatus) return true;
    return args.isOpen;
}

export function getParticipantStatusSeverity(status: string) {
    return PARTICIPANT_STATUS_SEVERITY[status as ParticipantStatus] ?? 'secondary';
}

export function getParticipantStatusIcon(status: string) {
    return PARTICIPANT_STATUS_ICON[status as ParticipantStatus] ?? 'pi pi-info-circle';
}

export function createNullFeatureRecord() {
    return createFeatureRecord(() => null);
}

export function getActiveParticipants(participants: EventParticipant[] | undefined) {
    return getParticipantByStatus(participants, 'ACCEPTED');
}

function getParticipantByStatus(participants: EventParticipant[] | undefined, status: ParticipantStatus) {
    if (!participants) return [];
    return participants.filter((p) => p.status === status);
}

export function openNavigation(location: string | null | undefined) {
    if (!location) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    window.open(url, '_blank');
}

export function isEventManager(event: Event | null | undefined, currentUserId: number | null | undefined) {
    if (!event || currentUserId == null) return false;
    return (
        event.hostId === currentUserId ||
        event.host?.id === currentUserId ||
        (event.coHosts?.some((coHost) => coHost.id === currentUserId) ?? false)
    );
}

export function hasLocalChatAccess(event: Event | null | undefined, currentUserId: number | null | undefined) {
    if (!event || currentUserId == null) return false;

    const isHost = isEventManager(event, currentUserId);
    if (isHost) return true;

    return (
        event.participants?.some(
            (participant) => participant.id === currentUserId && participant.status === 'ACCEPTED'
        ) ?? false
    );
}

export function hasLocalAuditLogAccess(event: Event | null | undefined, currentUserId: number | null | undefined) {
    if (!event || currentUserId == null) return false;

    if (isEventManager(event, currentUserId)) {
        return true;
    }

    return event.participants?.some((participant) => participant.id === currentUserId) ?? false;
}
