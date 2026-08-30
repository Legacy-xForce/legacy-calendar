import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, InviteStatus, TransportMode } from '../../prisma/generated/client.js';
import { GuestParticipateDto } from './dto/guest-participate.dto.js';

const GUEST_INVITE_INCLUDE = {
    user: { select: { id: true, username: true, isAdmin: true, authId: true, isGuest: true } },
    event: { select: { id: true, hostId: true, participationDeadline: true, endTime: true } }
} satisfies Prisma.GuestInviteTokenInclude;

export type GuestInviteWithRelations = Prisma.GuestInviteTokenGetPayload<{
    include: typeof GUEST_INVITE_INCLUDE;
}>;

@Injectable()
export class InvitesRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async createGuestInvite(eventId: number, tokenHash: string, expiresAt: Date, username: string) {
        return this.prisma.$transaction(async (tx) => {
            const guestUser = await tx.user.create({
                data: {
                    username,
                    isGuest: true
                }
            });

            await tx.attendance.create({
                data: {
                    userId: guestUser.id,
                    eventId,
                    status: InviteStatus.PENDING
                }
            });

            const guestInvite = await tx.guestInviteToken.create({
                data: {
                    tokenHash,
                    userId: guestUser.id,
                    eventId,
                    expiresAt
                }
            });

            return { guestInvite, guestUser };
        });
    }

    async findByTokenHash(tokenHash: string): Promise<GuestInviteWithRelations | null> {
        return this.prisma.guestInviteToken.findUnique({
            where: { tokenHash },
            include: GUEST_INVITE_INCLUDE
        });
    }

    async updateGuestParticipation(userId: number, eventId: number, dto: GuestParticipateDto) {
        const { username, wantsFood, wantsWeed, wantsSleep, wantsAlcohol, wantsBeer, transportMode } = dto;
        let vehicleSeats = dto.vehicleSeats;

        if (transportMode === TransportMode.DRIVER && (!vehicleSeats || vehicleSeats < 2)) {
            vehicleSeats = 2;
        }

        return this.prisma.$transaction(async (tx) => {
            if (username) {
                await tx.user.update({ where: { id: userId }, data: { username } });
            }

            return tx.attendance.upsert({
                where: { userId_eventId: { userId, eventId } },
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
        });
    }

    async declineGuestParticipation(userId: number, eventId: number) {
        return this.prisma.attendance.update({
            where: { userId_eventId: { userId, eventId } },
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
}
