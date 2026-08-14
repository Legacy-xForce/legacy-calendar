import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ActionType, Prisma } from '../../prisma/generated/client.js';
import { AppLogger } from '../logging/app-logger.js';
import { AuditLogRepository, type AuditLogEntryWithRelations } from './audit-log.repository.js';
import { EventsRepository, type EventWithRelations } from '../events/events.repository.js';
import { UsersRepository, type UserRecord } from '../users/users.repository.js';
import { buildProfilePictureUrl } from '../users/profile-picture.util.js';

export type AuditLogPayload = {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
};

export type AuditLogUserRef = {
    id: number;
    username: string;
    profilePictureUrl: string | null;
};

export type AuditLogResponse = {
    id: number;
    eventId: number;
    actorId: number;
    actorUsername: string;
    actorProfilePictureUrl: string | null;
    impersonatorId: number | null;
    impersonatorUsername: string | null;
    impersonatorProfilePictureUrl: string | null;
    actionType: ActionType;
    payloadDiff: AuditLogPayload;
    resolvedUsers: Record<number, AuditLogUserRef>;
    createdAt: string;
};

const DIFF_USER_ID_FIELDS = new Set(['hostId', 'userId', 'passengerId', 'driverId']);

type AuditActor = {
    actorId: number;
    impersonatorId?: number | null;
};

@Injectable()
export class AuditLogService {
    private readonly logger = new AppLogger(AuditLogService.name);

    constructor(
        @Inject(AuditLogRepository) private readonly auditLogRepo: AuditLogRepository,
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(UsersRepository) private readonly usersRepo: UsersRepository
    ) {}

    async getEventAuditLog(eventId: number, userId: number): Promise<AuditLogResponse[]> {
        const event = await this.eventsRepo.findById(eventId);
        if (!event) {
            throw new NotFoundException(`Event with id ${eventId} not found`);
        }

        if (!this.canViewEventAuditLog(event, userId)) {
            throw new ForbiddenException('You are not allowed to view this audit log');
        }

        const entries = await this.auditLogRepo.findManyByEventId(eventId);
        const referencedUserIds = new Set<number>();
        for (const entry of entries) {
            for (const id of this.collectDiffUserIds(this.normalizePayloadDiff(entry.payloadDiff))) {
                referencedUserIds.add(id);
            }
        }

        const referencedUsers = await this.usersRepo.findManyByIds([...referencedUserIds]);
        const userMap = new Map(referencedUsers.map((user) => [user.id, user]));

        return entries.map((entry) => this.toResponse(entry, userMap));
    }

    recordEventCreated(event: EventWithRelations, actor: AuditActor) {
        return this.safeRecord('EVENT_CREATED', event.id, actor, {
            before: {},
            after: this.snapshotEvent(event)
        });
    }

    recordEventUpdated(
        eventId: number,
        before: EventWithRelations,
        after: EventWithRelations,
        actor: AuditActor
    ) {
        const payloadDiff = this.buildObjectDiff(this.snapshotEvent(before), this.snapshotEvent(after));
        if (Object.keys(payloadDiff.before).length === 0 && Object.keys(payloadDiff.after).length === 0) {
            return;
        }

        return this.safeRecord('EVENT_UPDATED', eventId, actor, payloadDiff);
    }

    recordEventDeleted(eventId: number, before: EventWithRelations, actor: AuditActor) {
        return this.safeRecord('EVENT_DELETED', eventId, actor, {
            before: this.snapshotEvent(before),
            after: {}
        });
    }

    recordParticipantJoined(
        eventId: number,
        participant: { userId: number; status: string; createdAt: Date },
        actor: AuditActor
    ) {
        return this.safeRecord('PARTICIPANT_JOINED', eventId, actor, {
            before: {},
            after: this.snapshotParticipant(participant)
        });
    }

    recordParticipantUpdated(
        eventId: number,
        before: { userId: number; status: string; createdAt: Date },
        after: { userId: number; status: string; createdAt: Date },
        actor: AuditActor
    ) {
        const payloadDiff = this.buildObjectDiff(this.snapshotParticipant(before), this.snapshotParticipant(after));
        if (Object.keys(payloadDiff.before).length === 0 && Object.keys(payloadDiff.after).length === 0) {
            return;
        }

        return this.safeRecord('PARTICIPANT_UPDATED', eventId, actor, payloadDiff);
    }

    recordParticipantDeclined(
        eventId: number,
        before: { userId: number; status: string; createdAt: Date },
        actor: AuditActor
    ) {
        return this.safeRecord('PARTICIPANT_DECLINED', eventId, actor, {
            before: this.snapshotParticipant(before),
            after: {}
        });
    }

    recordParticipantRemoved(
        eventId: number,
        before: { userId: number; status: string; createdAt: Date },
        actor: AuditActor
    ) {
        return this.safeRecord('PARTICIPANT_REMOVED', eventId, actor, {
            before: this.snapshotParticipant(before),
            after: {}
        });
    }

    recordParticipantInvited(eventId: number, invitedUser: { id: number; username: string }, actor: AuditActor) {
        return this.safeRecord('PARTICIPANT_INVITED', eventId, actor, {
            before: {},
            after: {
                userId: invitedUser.id,
                username: invitedUser.username
            }
        });
    }

    recordRideAssigned(
        eventId: number,
        before: { passengerId: number; driverId: number } | null,
        after: { passengerId: number; driverId: number },
        actor: AuditActor
    ) {
        return this.safeRecord('RIDE_ASSIGNED', eventId, actor, {
            before: before ? { passengerId: before.passengerId, driverId: before.driverId } : {},
            after: { passengerId: after.passengerId, driverId: after.driverId }
        });
    }

    recordRideUnassigned(
        eventId: number,
        before: { passengerId: number; driverId: number } | null,
        actor: AuditActor
    ) {
        return this.safeRecord('RIDE_UNASSIGNED', eventId, actor, {
            before: before ? { passengerId: before.passengerId, driverId: before.driverId } : {},
            after: {}
        });
    }

    private async safeRecord(actionType: ActionType, eventId: number, actor: AuditActor, payloadDiff: AuditLogPayload) {
        try {
            await this.auditLogRepo.create({
                eventId,
                actorId: actor.actorId,
                impersonatorId: actor.impersonatorId ?? null,
                actionType,
                payloadDiff
            });
        } catch (error) {
            this.logAuditFailure(actionType, eventId, error);
        }
    }

    private logAuditFailure(actionType: ActionType, eventId: number, error: unknown) {
        try {
            this.logger.error(
                'Failed to write audit log entry',
                {
                    actionType,
                    eventId,
                    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
                }
            );
        } catch {
            // Original request must continue even if audit logging or logging the failure breaks.
        }
    }

    private canViewEventAuditLog(event: EventWithRelations, userId: number) {
        return event.hostId === userId || event.participants.some((participant) => participant.userId === userId);
    }

    private toResponse(entry: AuditLogEntryWithRelations, userMap: Map<number, UserRecord>): AuditLogResponse {
        const payloadDiff = this.normalizePayloadDiff(entry.payloadDiff);
        const resolvedUsers: Record<number, AuditLogUserRef> = {};
        for (const id of this.collectDiffUserIds(payloadDiff)) {
            const user = userMap.get(id);
            if (user) {
                resolvedUsers[id] = {
                    id: user.id,
                    username: user.username,
                    profilePictureUrl: buildProfilePictureUrl(user.authId)
                };
            }
        }

        return {
            id: entry.id,
            eventId: entry.eventId,
            actorId: entry.actorId,
            actorUsername: entry.actor.username,
            actorProfilePictureUrl: buildProfilePictureUrl(entry.actor.authId),
            impersonatorId: entry.impersonatorId,
            impersonatorUsername: entry.impersonator?.username ?? null,
            impersonatorProfilePictureUrl: entry.impersonator ? buildProfilePictureUrl(entry.impersonator.authId) : null,
            actionType: entry.actionType,
            payloadDiff,
            resolvedUsers,
            createdAt: entry.createdAt.toISOString()
        };
    }

    private collectDiffUserIds(payloadDiff: AuditLogPayload): number[] {
        const ids = new Set<number>();
        for (const record of [payloadDiff.before, payloadDiff.after]) {
            for (const field of DIFF_USER_ID_FIELDS) {
                const value = record[field];
                if (typeof value === 'number') {
                    ids.add(value);
                }
            }
        }

        return [...ids];
    }

    private snapshotEvent(event: EventWithRelations): Record<string, unknown> {
        return {
            title: event.title,
            color: event.color,
            description: event.description,
            location: event.location,
            startTime: event.startTime.toISOString(),
            endTime: event.endTime?.toISOString() ?? null,
            hostId: event.hostId,
            isOpen: event.isOpen,
            hasAlcohol: event.hasAlcohol,
            hasFood: event.hasFood,
            hasSleep: event.hasSleep,
            hasWeed: event.hasWeed,
            alcoholPrice: event.alcoholPrice,
            beerPrice: event.beerPrice,
            foodPrice: event.foodPrice,
            hasBeer: event.hasBeer,
            sleepPrice: event.sleepPrice,
            weedPrice: event.weedPrice,
            isPrivate: event.isPrivate,
            participationDeadline: event.participationDeadline?.toISOString() ?? null
        };
    }

    private snapshotParticipant(participant: {
        userId: number;
        status: string;
        createdAt: Date;
        wantsAlcohol?: boolean;
        wantsBeer?: boolean;
        wantsFood?: boolean;
        wantsSleep?: boolean;
        wantsWeed?: boolean;
        transportMode?: string;
        vehicleSeats?: number;
    }): Record<string, unknown> {
        const snapshot: Record<string, unknown> = {
            userId: participant.userId,
            status: participant.status,
            joinedAt: participant.createdAt.toISOString()
        };

        if (participant.wantsAlcohol !== undefined) snapshot.wantsAlcohol = participant.wantsAlcohol;
        if (participant.wantsBeer !== undefined) snapshot.wantsBeer = participant.wantsBeer;
        if (participant.wantsFood !== undefined) snapshot.wantsFood = participant.wantsFood;
        if (participant.wantsSleep !== undefined) snapshot.wantsSleep = participant.wantsSleep;
        if (participant.wantsWeed !== undefined) snapshot.wantsWeed = participant.wantsWeed;
        if (participant.transportMode !== undefined) snapshot.transportMode = participant.transportMode;
        if (participant.vehicleSeats !== undefined) snapshot.vehicleSeats = participant.vehicleSeats;

        return snapshot;
    }

    private buildObjectDiff(before: Record<string, unknown>, after: Record<string, unknown>): AuditLogPayload {
        const diffBefore: Record<string, unknown> = {};
        const diffAfter: Record<string, unknown> = {};
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

        for (const key of keys) {
            const beforeValue = before[key];
            const afterValue = after[key];
            if (!this.isEqualValue(beforeValue, afterValue)) {
                if (beforeValue !== undefined) {
                    diffBefore[key] = beforeValue;
                }
                if (afterValue !== undefined) {
                    diffAfter[key] = afterValue;
                }
            }
        }

        return { before: diffBefore, after: diffAfter };
    }

    private isEqualValue(beforeValue: unknown, afterValue: unknown): boolean {
        return this.stringifyValue(beforeValue) === this.stringifyValue(afterValue);
    }

    private stringifyValue(value: unknown): string {
        return JSON.stringify(value);
    }

    private normalizePayloadDiff(payloadDiff: Prisma.JsonValue): AuditLogPayload {
        const record = payloadDiff as Partial<AuditLogPayload> | null;
        return {
            before: this.normalizeRecord(record?.before),
            after: this.normalizeRecord(record?.after)
        };
    }

    private normalizeRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        return value as Record<string, unknown>;
    }
}
