import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Event, InviteStatus, TransportMode } from '../../prisma/generated/client.js';
import { USER_SELECT } from '../users/users.repository.js';
import { ParticipateDto } from './dto/participate.dto.js';
import { normalizeVehicleSeats } from './vehicle-seats.util.js';
import { guestParticipantIdOf } from '../common/participant-id.util.js';

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
            guestParticipant: { select: { id: true, displayName: true } }
        }
    },
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

    async create(data: Prisma.EventCreateInput): Promise<EventWithRelations> {
        return this.prisma.event.create({
            data,
            include: EVENT_INCLUDE
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
        const { wantsFood, wantsWeed, wantsSleep, wantsAlcohol, wantsBeer, transportMode } = participateDto;
        const { vehicleSeats, vehicleSeatsOutbound, vehicleSeatsReturn } = normalizeVehicleSeats(participateDto);

        return this.prisma.attendance.upsert({
            where: {
                userId_eventId: { userId, eventId }
            },
            update: {
                status: InviteStatus.ACCEPTED,
                wantsFood,
                wantsWeed,
                wantsSleep,
                wantsAlcohol,
                wantsBeer,
                transportMode,
                vehicleSeats,
                vehicleSeatsOutbound,
                vehicleSeatsReturn
            },
            create: {
                userId,
                eventId,
                status: InviteStatus.ACCEPTED,
                wantsFood,
                wantsWeed,
                wantsSleep,
                wantsAlcohol,
                wantsBeer,
                transportMode,
                vehicleSeats,
                vehicleSeatsOutbound,
                vehicleSeatsReturn
            },
            include: {
                user: { select: USER_SELECT },
                guestParticipant: { select: { id: true, displayName: true } }
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
                wantsFood: false,
                wantsWeed: false,
                wantsSleep: false,
                wantsAlcohol: false,
                wantsBeer: false
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
