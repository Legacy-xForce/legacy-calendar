import type { Event, EventParticipant, FeatureId, ParticipantStatus } from '../types/Event';

const MAX_EVENT_START_TIME_YEARS_AHEAD = 1;

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

export function createFeatureRecord<T>(
    featureIds: readonly FeatureId[],
    factory: (feature: FeatureId) => T
): Record<FeatureId, T> {
    return Object.fromEntries(featureIds.map((feature) => [feature, factory(feature)]));
}

export function toggleFeature(features: FeatureId[], feature: FeatureId) {
    const index = features.indexOf(feature);
    if (index === -1) {
        features.push(feature);
        return;
    }

    features.splice(index, 1);
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

type EventWithFeatures = Pick<Event, 'features'> | null | undefined;

export function selectedFeaturesFromEvent(event: EventWithFeatures): FeatureId[] {
    return event?.features.map((feature) => feature.id) ?? [];
}

/** The `features` payload for create/update: the selected ids with their optional budgets. */
export function eventFeaturesPayload(selected: FeatureId[], prices: Record<FeatureId, number | null>) {
    return selected.map((featureId) => {
        const price = prices[featureId];
        return typeof price === 'number' ? { featureId, price } : { featureId };
    });
}

export function participantWantsFromSelection(features: FeatureId[]) {
    return { featureIds: features };
}

export function featurePricesFromEvent(event: EventWithFeatures): Record<FeatureId, number | null> {
    return Object.fromEntries((event?.features ?? []).map((feature) => [feature.id, feature.price ?? null]));
}

export function participantFeatures(participant: Pick<EventParticipant, 'featureIds'> | null | undefined): FeatureId[] {
    return participant?.featureIds ?? [];
}

export function featureCount(participants: EventParticipant[], feature: FeatureId) {
    return participants.filter(
        (participant) => participant.status === 'ACCEPTED' && participant.featureIds?.includes(feature)
    ).length;
}

export function featureSplitPrice(event: EventWithFeatures, participants: EventParticipant[], feature: FeatureId) {
    const price = event?.features.find((entry) => entry.id === feature)?.price ?? 0;
    if (!price) return 0;

    const count = featureCount(participants, feature);
    return count > 0 ? price / count : price;
}

export function totalEventBudget(event: EventWithFeatures) {
    return (event?.features ?? []).reduce((total, feature) => total + (feature.price ?? 0), 0);
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

export function getActiveParticipants(participants: EventParticipant[] | undefined) {
    return getParticipantByStatus(participants, 'ACCEPTED');
}

function getParticipantByStatus(participants: EventParticipant[] | undefined, status: ParticipantStatus) {
    if (!participants) return [];
    return participants.filter((p) => p.status === status);
}

export type UserEventRole = 'hosting' | 'going' | 'invited' | 'declined' | null;

/** How the given user relates to an event, for at-a-glance RSVP badges. */
export function getUserEventRole(event: Event | null | undefined, userId: number | null | undefined): UserEventRole {
    if (!event || userId == null) return null;
    if (event.hostId === userId || event.host?.id === userId) return 'hosting';
    if (event.coHosts?.some((coHost) => coHost.id === userId)) return 'hosting';

    const status = event.participants?.find((participant) => participant.id === userId)?.status;
    if (status === 'ACCEPTED') return 'going';
    if (status === 'PENDING') return 'invited';
    if (status === 'DECLINED') return 'declined';
    return null;
}

/** Event end, falling back to one hour after the start when no end time is set. */
export function getEventEnd(event: Pick<Event, 'startTime' | 'endTime'>) {
    if (event.endTime) return new Date(event.endTime);
    return new Date(new Date(event.startTime).getTime() + 60 * 60 * 1000);
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
