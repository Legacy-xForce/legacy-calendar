import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Event, InviteStatus, TransportMode } from '../../prisma/generated/client.js';
import { USER_SELECT } from '../users/users.repository.js';
import { ParticipateDto } from './dto/participate.dto.js';
import { normalizeVehicleSeats } from './vehicle-seats.util.js';
import { guestParticipantIdOf } from '../common/participant-id.util.js';

const EVENT_FEATURES_INCLUDE = {
    include: { feature: { select: { id: true, name: true, emoji: true, eventId: true } } },
    orderBy: { featureId: 'asc' as const }
};

export const ATTENDANCE_FEATURES_INCLUDE = {
    select: { featureId: true, feature: { select: { name: true, emoji: true } } }
};

/** Nested write that makes the attendance's opted-in features exactly `featureIds`. */
export const replaceAttendanceFeatures = (featureIds: number[]) => ({
    deleteMany: {},
    create: featureIds.map((featureId) => ({ featureId }))
});

/** A feature row ready to be stored on an event: an existing feature, or a new one-time feature. */
export type PlannedFeature = {
    /** Set for catalog features and one-time features the event already has. */
    featureId?: number;
    name: string;
    nameKey: string;
    emoji: string;
    oneTime: boolean;
    price: number | null;
    mandatory: boolean;
    eligibleUserIds: number[];
};

async function writeEventFeatures(tx: Prisma.TransactionClient, eventId: number, features: PlannedFeature[]) {
    const keptOneTime = features
        .filter((row) => row.oneTime && row.featureId !== undefined)
        .map((row) => row.featureId!);
    // Deleting a one-time feature cascades to its event link and participants' opt-ins.
    await tx.feature.deleteMany({ where: { eventId, id: { notIn: keptOneTime } } });
    await tx.eventFeature.deleteMany({ where: { eventId } });

    const offeredIds: number[] = [];
    for (const row of features) {
        const featureId =
            row.featureId ??
            (
                await tx.feature.create({
                    data: { name: row.name, nameKey: row.nameKey, emoji: row.emoji, eventId },
                    select: { id: true }
                })
            ).id;
        offeredIds.push(featureId);
        await tx.eventFeature.create({
            data: {
                eventId,
                featureId,
                price: row.price,
                mandatory: row.mandatory,
                eligibleUserIds: row.eligibleUserIds
            }
        });

        const restricted = row.eligibleUserIds.length > 0;
        if (restricted) {
            await tx.attendanceFeature.deleteMany({
                where: {
                    featureId,
                    attendance: { eventId, OR: [{ userId: null }, { userId: { notIn: row.eligibleUserIds } }] }
                }
            });
        }
        if (row.mandatory) {
            const attendances = await tx.attendance.findMany({
                where: {
                    eventId,
                    status: InviteStatus.ACCEPTED,
                    ...(restricted ? { userId: { in: row.eligibleUserIds } } : {})
                },
                select: { id: true }
            });
            await tx.attendanceFeature.createMany({
                data: attendances.map((attendance) => ({ attendanceId: attendance.id, featureId })),
                skipDuplicates: true
            });
        }
    }

    // Features the event no longer offers disappear from everyone's opt-ins.
    await tx.attendanceFeature.deleteMany({
        where: { attendance: { eventId }, featureId: { notIn: offeredIds } }
    });
}

export const EVENT_INCLUDE = {
    host: { select: USER_SELECT },
    coHosts: {
        include: {
            user: { select: USER_SELECT }
        },
        orderBy: { addedAt: 'asc' as const }
    },
    participants: {
        include: {
            user: { select: USER_SELECT },
            guestParticipant: { select: { id: true, displayName: true } },
            features: ATTENDANCE_FEATURES_INCLUDE
        }
    },
    features: EVENT_FEATURES_INCLUDE,
    // RideAssignment ids are namespaced: positive user IDs, negative guest participant IDs.
    rideAssignments: true
} satisfies Prisma.EventInclude;

export type EventWithRelations = Prisma.EventGetPayload<{
    include: typeof EVENT_INCLUDE;
}>;

/** Minimal event graph used by chat access checks and notifications. */
export const CHAT_ACCESS_SELECT = {
    id: true,
    title: true,
    hostId: true,
    participants: {
        select: {
            userId: true,
            status: true
        }
    }
} satisfies Prisma.EventSelect;

export type EventChatAccess = Prisma.EventGetPayload<{
    select: typeof CHAT_ACCESS_SELECT;
}>;

@Injectable()
export class EventsRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async create(data: Prisma.EventCreateInput, features: PlannedFeature[] = []): Promise<EventWithRelations> {
        return this.prisma.$transaction(async (tx) => {
            const { id } = await tx.event.create({ data, select: { id: true } });
            await writeEventFeatures(tx, id, features);
            return tx.event.findUniqueOrThrow({ where: { id }, include: EVENT_INCLUDE });
        });
    }

    /** Replaces the event's features and reconciles every participant's opt-ins with the new rules. */
    async replaceFeatures(eventId: number, features: PlannedFeature[]): Promise<void> {
        await this.prisma.$transaction((tx) => writeEventFeatures(tx, eventId, features));
    }

    async findCatalogFeatures(ids: number[]) {
        if (ids.length === 0) return [];
        return this.prisma.feature.findMany({
            where: { id: { in: ids }, eventId: null },
            select: { id: true, name: true, nameKey: true, emoji: true }
        });
    }

    async getUserById(id: number) {
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findAll(userId: number, start: Date, end: Date): Promise<EventWithRelations[]> {
        return this.prisma.event.findMany({
            where: {
                AND: [this.buildVisibleEventsWhere(userId), { startTime: { gte: start, lte: end } }]
            },
            include: EVENT_INCLUDE,
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }]
        });
    }

    async findUpcoming(userId: number): Promise<EventWithRelations[]> {
        return this.prisma.event.findMany({
            where: {
                AND: [
                    this.buildVisibleEventsWhere(userId),
                    {
                        OR: [
                            { endTime: { gte: new Date() } },
                            { AND: [{ endTime: null }, { startTime: { gte: new Date() } }] }
                        ]
                    }
                ]
            },
            include: EVENT_INCLUDE,
            orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
            take: 10
        });
    }

    async findOne(id: number, userId?: number): Promise<EventWithRelations | null> {
        return this.prisma.event.findFirst({
            where: {
                id,
                ...this.buildVisibleEventsWhere(userId)
            },
            include: EVENT_INCLUDE
        });
    }

    async findById(id: number): Promise<EventWithRelations | null> {
        return this.prisma.event.findUnique({
            where: { id },
            include: EVENT_INCLUDE
        });
    }

    /** Chat only needs the host and participant RSVPs, not the full event graph. */
    async findChatAccessById(id: number): Promise<EventChatAccess | null> {
        return this.prisma.event.findUnique({
            where: { id },
            select: CHAT_ACCESS_SELECT
        });
    }

    async remove(id: number): Promise<Event> {
        return this.prisma.event.delete({ where: { id } });
    }

    async join(userId: number, eventId: number, participateDto: ParticipateDto) {
        const { featureIds, transportMode } = participateDto;
        const { vehicleSeats, vehicleSeatsOutbound, vehicleSeatsReturn } = normalizeVehicleSeats(participateDto);

        return this.prisma.attendance.upsert({
            where: {
                userId_eventId: { userId, eventId }
            },
            update: {
                status: InviteStatus.ACCEPTED,
                transportMode,
                vehicleSeats,
                vehicleSeatsOutbound,
                vehicleSeatsReturn,
                ...(featureIds ? { features: replaceAttendanceFeatures(featureIds) } : {})
            },
            create: {
                userId,
                eventId,
                status: InviteStatus.ACCEPTED,
                transportMode,
                vehicleSeats,
                vehicleSeatsOutbound,
                vehicleSeatsReturn,
                ...(featureIds ? { features: { create: featureIds.map((featureId) => ({ featureId })) } } : {})
            },
            include: {
                user: { select: USER_SELECT },
                guestParticipant: { select: { id: true, displayName: true } },
                features: ATTENDANCE_FEATURES_INCLUDE
            }
        });
    }

    async updatePaymentStatus(eventId: number, userId: number, hasPaid: boolean) {
        if (userId < 0) {
            return this.prisma.attendance.update({
                where: {
                    guestParticipantId_eventId: { guestParticipantId: guestParticipantIdOf(userId), eventId }
                },
                data: {
                    hasPaid
                }
            });
        }
        return this.prisma.attendance.update({
            where: {
                userId_eventId: { userId, eventId }
            },
            data: {
                hasPaid
            }
        });
    }

    async assignRides(
        eventId: number,
        assignments: Array<{
            passengerId: number;
            driverId: number | null;
            directions: ('OUTBOUND' | 'RETURN')[];
            previousDriverId?: number;
        }>
    ) {
        if (assignments.length === 0) {
            return [];
        }

        const operations: Prisma.PrismaPromise<unknown>[] = [];

        for (const { passengerId, driverId, directions, previousDriverId } of assignments) {
            if (driverId === null) {
                operations.push(
                    this.prisma.rideAssignment.deleteMany({
                        where: {
                            eventId,
                            passengerId,
                            direction: { in: directions },
                            ...(previousDriverId !== undefined && { driverId: previousDriverId })
                        }
                    })
                );
                continue;
            }

            for (const direction of directions) {
                operations.push(
                    this.prisma.rideAssignment.upsert({
                        where: {
                            eventId_passengerId_direction: { eventId, passengerId, direction }
                        },
                        update: {
                            driverId
                        },
                        create: {
                            eventId,
                            passengerId,
                            driverId,
                            direction
                        }
                    })
                );
            }
        }

        return this.prisma.$transaction(operations);
    }

    async deleteRideAssignmentsForUsers(eventId: number, userIds: number[]) {
        if (userIds.length === 0) {
            return { count: 0 };
        }

        return this.prisma.rideAssignment.deleteMany({
            where: {
                eventId,
                OR: [{ passengerId: { in: userIds } }, { driverId: { in: userIds } }]
            }
        });
    }

    async leave(userId: number, eventId: number) {
        return this.prisma.attendance.update({
            where: {
                userId_eventId: { userId, eventId }
            },
            data: {
                status: InviteStatus.DECLINED,
                transportMode: TransportMode.NEEDS_RIDE,
                vehicleSeats: 0,
                vehicleSeatsOutbound: 0,
                vehicleSeatsReturn: 0,
                features: { deleteMany: {} }
            }
        });
    }

    async update(id: number, data: Prisma.EventUpdateInput): Promise<EventWithRelations> {
        return this.prisma.event.update({
            where: { id },
            data,
            include: EVENT_INCLUDE
        });
    }

    async getCoHostIds(eventId: number): Promise<number[]> {
        const coHosts = await this.prisma.eventCoHost.findMany({
            where: { eventId },
            select: { userId: true }
        });
        return coHosts.map((coHost) => coHost.userId);
    }

    async setCoHosts(eventId: number, userIds: number[]): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.eventCoHost.deleteMany({
                where: { eventId, userId: { notIn: userIds } }
            }),
            ...userIds.map((userId) =>
                this.prisma.eventCoHost.upsert({
                    where: { eventId_userId: { eventId, userId } },
                    update: {},
                    create: { eventId, userId }
                })
            )
        ]);
    }

    async inviteUser(eventId: number, username: string) {
        const user = await this.prisma.user.findUnique({ where: { username } });
        if (!user) {
            return null;
        }

        const existing = await this.prisma.attendance.findUnique({
            where: { userId_eventId: { userId: user.id, eventId } }
        });

        if (existing) return user;

        await this.prisma.attendance.create({
            data: {
                userId: user.id,
                eventId,
                status: InviteStatus.PENDING
            }
        });

        return user;
    }

    async getParticipantTokens(eventId: number, status?: InviteStatus): Promise<string[]> {
        const attendances = await this.prisma.attendance.findMany({
            where: { eventId, ...(status ? { status } : {}), userId: { not: null } },
            include: { user: { include: { fcmTokens: true } } }
        });

        return attendances.flatMap((a) => a.user?.fcmTokens.map((t) => t.token) ?? []);
    }

    async getUserTokens(userIds: number[]): Promise<string[]> {
        const tokens = await this.prisma.fcmToken.findMany({
            where: { userId: { in: userIds } },
            select: { token: true }
        });

        return tokens.map((t) => t.token);
    }

    private buildVisibleEventsWhere(userId?: number): Prisma.EventWhereInput {
        const visibilityClauses: Prisma.EventWhereInput[] = [{ isPrivate: false }];

        if (userId !== undefined) {
            visibilityClauses.push(
                { hostId: userId },
                { participants: { some: { userId } } },
                { coHosts: { some: { userId } } }
            );
        }

        return { OR: visibilityClauses };
    }
}
