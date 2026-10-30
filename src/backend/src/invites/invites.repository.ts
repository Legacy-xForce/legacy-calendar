import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, InviteStatus, TransportMode } from '../../prisma/generated/client.js';
import { GuestParticipateDto } from './dto/guest-participate.dto.js';
import { ATTENDANCE_FEATURES_INCLUDE, replaceAttendanceFeatures } from '../events/events.repository.js';
import { normalizeVehicleSeats } from '../events/vehicle-seats.util.js';

const GUEST_INVITE_INCLUDE = {
    guestParticipant: { select: { id: true, displayName: true } },
    event: { select: { id: true, hostId: true, participationDeadline: true, endTime: true } }
} satisfies Prisma.GuestInviteTokenInclude;

export type GuestInviteWithRelations = Prisma.GuestInviteTokenGetPayload<{
    include: typeof GUEST_INVITE_INCLUDE;
}>;

@Injectable()
export class InvitesRepository {
    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

    async createGuestInvite(eventId: number, tokenHash: string, expiresAt: Date) {
        return this.prisma.$transaction(async (tx) => {
            const guestParticipant = await tx.guestParticipant.create({
                data: {}
            });

            await tx.attendance.create({
                data: {
                    guestParticipantId: guestParticipant.id,
                    eventId,
                    status: InviteStatus.PENDING
                }
            });

            const guestInvite = await tx.guestInviteToken.create({
                data: {
                    tokenHash,
                    guestParticipantId: guestParticipant.id,
                    eventId,
                    expiresAt
                }
            });

            return { guestInvite, guestParticipant };
        });
    }

    async findByTokenHash(tokenHash: string): Promise<GuestInviteWithRelations | null> {
        return this.prisma.guestInviteToken.findUnique({
            where: { tokenHash },
            include: GUEST_INVITE_INCLUDE
        });
    }

    findGuestParticipant(id: number) {
        return this.prisma.guestParticipant.findUnique({ where: { id } });
    }

    async updateGuestParticipation(guestParticipantId: number, eventId: number, dto: GuestParticipateDto) {
        const { username, featureIds, transportMode } = dto;
        const { vehicleSeats, vehicleSeatsOutbound, vehicleSeatsReturn } = normalizeVehicleSeats(dto);

        return this.prisma.$transaction(async (tx) => {
            if (username) {
                await tx.guestParticipant.update({
                    where: { id: guestParticipantId },
                    data: { displayName: username }
                });
            }

            return tx.attendance.upsert({
                where: { guestParticipantId_eventId: { guestParticipantId, eventId } },
                update: {
                    status: InviteStatus.ACCEPTED,
                    transportMode,
                    vehicleSeats,
                    vehicleSeatsOutbound,
                    vehicleSeatsReturn,
                    ...(featureIds ? { features: replaceAttendanceFeatures(featureIds) } : {})
                },
                create: {
                    guestParticipantId,
                    eventId,
                    status: InviteStatus.ACCEPTED,
                    transportMode,
                    vehicleSeats,
                    vehicleSeatsOutbound,
                    vehicleSeatsReturn,
                    ...(featureIds ? { features: { create: featureIds.map((featureId) => ({ featureId })) } } : {})
                },
                include: { features: ATTENDANCE_FEATURES_INCLUDE }
            });
        });
    }

    async declineGuestParticipation(guestParticipantId: number, eventId: number) {
        return this.prisma.attendance.update({
            where: { guestParticipantId_eventId: { guestParticipantId, eventId } },
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
}
