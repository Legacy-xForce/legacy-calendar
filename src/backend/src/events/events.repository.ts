import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Event, InviteStatus, TransportMode } from '../../prisma/generated/client.js';
import { ParticipateDto } from './dto/participate.dto.js';

const USER_SUMMARY_SELECT = {
    id: true,
    username: true,
    isAdmin: true,
    authId: true,
    isGuest: true
} satisfies Prisma.UserSelect;

export const EVENT_INCLUDE = {
    host: { select: USER_SUMMARY_SELECT },
    coHosts: {
        include: {
            user: { select: USER_SUMMARY_SELECT }
        },
        orderBy: { addedAt: 'asc' as const }
    },
    participants: {
        include: {
            user: { select: USER_SUMMARY_SELECT }
        }
    },
    rideAssignments: {
        include: {
            driver: { select: USER_SUMMARY_SELECT },
            passenger: { select: USER_SUMMARY_SELECT }
        }
    }
} satisfies Prisma.EventInclude;

export type EventWithRelations = Prisma.EventGetPayload<{
    include: typeof EVENT_INCLUDE;
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

    async remove(id: number): Promise<Event> {
        return this.prisma.event.delete({ where: { id } });
    }

    async join(userId: number, eventId: number, participateDto: ParticipateDto) {
        const { wantsFood, wantsWeed, wantsSleep, wantsAlcohol, wantsBeer, transportMode } = participateDto;
        let vehicleSeats = participateDto.vehicleSeats;

        if (transportMode === TransportMode.DRIVER && (!vehicleSeats || vehicleSeats < 2)) {
            vehicleSeats = 2;
        }

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
                vehicleSeats
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
                vehicleSeats
            }
        });
    }

    async assignRide(eventId: number, passengerId: number, driverId: number | null) {
        if (driverId === null) {
            return this.prisma.rideAssignment.deleteMany({
                where: {
                    eventId,
                    passengerId
                }
            });
        }

        return this.prisma.rideAssignment.upsert({
            where: {
                eventId_passengerId: { eventId, passengerId }
            },
            update: {
                driverId
            },
            create: {
                eventId,
                passengerId,
                driverId
            }
        });
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

    async getParticipantTokens(eventId: number): Promise<string[]> {
        const attendances = await this.prisma.attendance.findMany({
            where: { eventId },
            include: { user: { include: { fcmTokens: true } } }
        });

        return attendances.flatMap((a) => a.user.fcmTokens.map((t) => t.token));
    }

    async getParticipantTokensByStatus(eventId: number, status: InviteStatus): Promise<string[]> {
        const attendances = await this.prisma.attendance.findMany({
            where: { eventId, status },
            include: { user: { include: { fcmTokens: true } } }
        });

        return attendances.flatMap((a) => a.user.fcmTokens.map((t) => t.token));
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
