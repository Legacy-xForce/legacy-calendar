import { BadRequestException, ForbiddenException } from '@nestjs/common';

type EventTiming = {
    endTime: Date | null;
    participationDeadline: Date | null;
};

/**
 * Shared timing guards for event mutations. Guest invites and authenticated
 * event endpoints previously re-implemented these checks with slightly
 * different wording, so the message stays configurable.
 */
export function assertEventNotEnded(
    event: EventTiming,
    message = 'This event has already ended and cannot be modified'
): void {
    if (event.endTime && new Date() > event.endTime) {
        throw new ForbiddenException(message);
    }
}

export function assertDeadlineNotPassed(
    event: EventTiming,
    message = 'The participation deadline for this event has passed'
): void {
    if (event.participationDeadline && new Date() > event.participationDeadline) {
        throw new ForbiddenException(message);
    }
}

type OfferedFeature = { featureId: number; mandatory: boolean; eligibleUserIds: number[] };

/** Empty list = everyone; otherwise registered users on the list (guests have negative ids). */
export function isEligibleForFeature(feature: Pick<OfferedFeature, 'eligibleUserIds'>, participantId: number): boolean {
    return feature.eligibleUserIds.length === 0 || feature.eligibleUserIds.includes(participantId);
}

/**
 * The feature set an accepted participant ends up with. `requested` must only
 * contain offered features the participant is eligible for; `current` is kept
 * when nothing is requested. Mandatory features are always added, so a client
 * can never opt out of them.
 */
export function resolveFeatureSelection(
    event: { features: OfferedFeature[] },
    participantId: number,
    requested: number[] | undefined,
    current: number[]
): number[] {
    const offered = new Map(event.features.map((entry) => [entry.featureId, entry]));
    const unknown = (requested ?? []).filter((id) => !offered.has(id));
    if (unknown.length > 0) {
        throw new BadRequestException(`Feature ids not available for this event: ${unknown.join(', ')}`);
    }
    const ineligible = (requested ?? []).filter((id) => !isEligibleForFeature(offered.get(id)!, participantId));
    if (ineligible.length > 0) {
        throw new ForbiddenException(`You cannot select these features: ${ineligible.join(', ')}`);
    }

    const base = requested ?? current.filter((id) => offered.has(id));
    const mandatory = event.features
        .filter((entry) => entry.mandatory && isEligibleForFeature(entry, participantId))
        .map((entry) => entry.featureId);
    return [...new Set([...base, ...mandatory])];
}
