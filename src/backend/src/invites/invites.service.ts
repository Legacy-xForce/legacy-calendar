import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client.js';
import { EventsRepository, type EventWithRelations } from '../events/events.repository.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationCode } from '../notifications/notification-codes.js';
import { EVENT_NOTIFICATION_TITLES, EVENT_NOTIFICATION_MESSAGES } from '../events/event-notification.constants.js';
import { mapEventToDto } from '../events/event-response.mapper.js';
import { AppLogger } from '../logging/app-logger.js';
import { InvitesRepository, type GuestInviteWithRelations } from './invites.repository.js';
import { GuestParticipateDto } from './dto/guest-participate.dto.js';
import { generateGuestToken, hashGuestToken } from './guest-token.util.js';

const FALLBACK_INVITE_LIFETIME_DAYS = 30;

@Injectable()
export class InvitesService {
    private readonly logger = new AppLogger(InvitesService.name);

    constructor(
        @Inject(InvitesRepository) private readonly invitesRepo: InvitesRepository,
        @Inject(EventsRepository) private readonly eventsRepo: EventsRepository,
        @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
        @Inject(NotificationsService) private readonly notificationsService: NotificationsService
    ) {}

    async generateInvite(eventId: number, hostUserId: number, impersonatorId: number | null = null) {
        const event = await this.findEventOrThrow(eventId);

        if (event.hostId !== hostUserId) {
            throw new ForbiddenException('Only the host can create guest invites');
        }

        this.validateEventNotEnded(event);

        const expiresAt = this.resolveExpiry(event);
        const { token, tokenHash } = this.createUniqueToken();
        const { guestParticipant } = await this.invitesRepo.createGuestInvite(eventId, tokenHash, expiresAt);

        await this.auditLogService.recordParticipantInvited(
            eventId,
            { id: -guestParticipant.id, username: guestParticipant.displayName },
            {
                actorId: hostUserId,
                impersonatorId
            }
        );

        this.logger.info('Guest invite created', { eventId, guestParticipantId: guestParticipant.id, hostUserId });

        return {
            token,
            guestUserId: -guestParticipant.id,
            expiresAt
        };
    }

    async getInvite(guestInvite: GuestInviteWithRelations) {
        const event = await this.eventsRepo.findById(guestInvite.eventId);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        return this.buildInviteResponse(event, guestInvite);
    }

    async updateParticipation(guestInvite: GuestInviteWithRelations, dto: GuestParticipateDto) {
        const event = await this.findEventOrThrow(guestInvite.eventId);
        this.validateEventNotEnded(event);
        this.validateDeadlineNotPassed(event);

        const before = event.participants.find(
            (participant) => participant.guestParticipantId === guestInvite.guestParticipantId
        );

        try {
            await this.invitesRepo.updateGuestParticipation(guestInvite.guestParticipantId, guestInvite.eventId, dto);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ForbiddenException('That username is already taken, please choose another one');
            }
            throw error;
        }

        const updatedEvent = await this.findEventOrThrow(guestInvite.eventId);
        const after = updatedEvent.participants.find(
            (participant) => participant.guestParticipantId === guestInvite.guestParticipantId
        );

        if (!before) {
            if (after) {
                await this.auditLogService.recordParticipantJoined(guestInvite.eventId, after, {
                    actorGuestParticipantId: guestInvite.guestParticipantId,
                    actorName: after.guestParticipant?.displayName
                });
            }
        } else if (after) {
            await this.auditLogService.recordParticipantUpdated(guestInvite.eventId, before, after, {
                actorGuestParticipantId: guestInvite.guestParticipantId,
                actorName: after.guestParticipant?.displayName
            });
        }

        await this.notifyHost(updatedEvent, guestInvite.guestParticipantId, before ? 'updated' : 'accepted');

        this.logger.info('Guest participation updated', {
            eventId: guestInvite.eventId,
            guestParticipantId: guestInvite.guestParticipantId
        });

        const refreshedInvite = { ...guestInvite };
        return this.buildInviteResponse(updatedEvent, refreshedInvite);
    }

    async leave(guestInvite: GuestInviteWithRelations) {
        const event = await this.findEventOrThrow(guestInvite.eventId);
        this.validateEventNotEnded(event);

        const before = event.participants.find(
            (participant) => participant.guestParticipantId === guestInvite.guestParticipantId
        );

        await this.invitesRepo.declineGuestParticipation(guestInvite.guestParticipantId, guestInvite.eventId);

        if (before) {
            await this.auditLogService.recordParticipantDeclined(guestInvite.eventId, before, {
                actorGuestParticipantId: guestInvite.guestParticipantId,
                actorName: before.guestParticipant?.displayName
            });
        }

        await this.notifyHost(event, guestInvite.guestParticipantId, 'cancelled');

        this.logger.info('Guest left event', {
            eventId: guestInvite.eventId,
            guestParticipantId: guestInvite.guestParticipantId
        });

        const updatedEvent = await this.findEventOrThrow(guestInvite.eventId);
        return this.buildInviteResponse(updatedEvent, guestInvite);
    }

    private buildInviteResponse(event: EventWithRelations, guestInvite: GuestInviteWithRelations) {
        const isDeadlinePassed = !!event.participationDeadline && new Date() > event.participationDeadline;

        return {
            event: mapEventToDto(event),
            guestUserId: -guestInvite.guestParticipantId,
            isDeadlinePassed,
            canEdit: !isDeadlinePassed && !(event.endTime && new Date() > event.endTime)
        };
    }

    private async notifyHost(
        event: EventWithRelations,
        guestParticipantId: number,
        action: 'accepted' | 'updated' | 'cancelled'
    ) {
        const hostTokens = await this.eventsRepo.getUserTokens([event.hostId]);
        if (hostTokens.length === 0) return;

        const guestParticipant = await this.invitesRepo.findGuestParticipant(guestParticipantId);
        const username = guestParticipant?.displayName || 'A guest';

        const messages = {
            accepted: {
                type: NotificationCode.PARTICIPATION_ACCEPTED,
                title: EVENT_NOTIFICATION_TITLES.participationAccepted,
                body: EVENT_NOTIFICATION_MESSAGES.participationAccepted(username, event.title)
            },
            updated: {
                type: NotificationCode.PARTICIPATION_UPDATED,
                title: EVENT_NOTIFICATION_TITLES.participationUpdated,
                body: EVENT_NOTIFICATION_MESSAGES.participationUpdated(username, event.title)
            },
            cancelled: {
                type: NotificationCode.PARTICIPATION_CANCELLED,
                title: EVENT_NOTIFICATION_TITLES.participationCancelled,
                body: EVENT_NOTIFICATION_MESSAGES.participationCancelled(username, event.title)
            }
        }[action];

        await this.notificationsService.sendMulticast(hostTokens, messages.title, messages.body, {
            type: messages.type,
            eventId: String(event.id),
            actorUsername: username
        });
    }

    private resolveExpiry(event: EventWithRelations): Date {
        if (event.participationDeadline) return event.participationDeadline;
        if (event.endTime) return event.endTime;

        const fallback = new Date();
        fallback.setDate(fallback.getDate() + FALLBACK_INVITE_LIFETIME_DAYS);
        return fallback;
    }

    private validateDeadlineNotPassed(event: EventWithRelations) {
        if (event.participationDeadline && new Date() > event.participationDeadline) {
            throw new ForbiddenException('The participation deadline for this event has passed');
        }
    }

    private validateEventNotEnded(event: EventWithRelations) {
        if (event.endTime && new Date() > event.endTime) {
            throw new ForbiddenException('This event has already ended');
        }
    }

    private async findEventOrThrow(eventId: number): Promise<EventWithRelations> {
        const event = await this.eventsRepo.findById(eventId);
        if (!event) {
            throw new NotFoundException(`Event with id ${eventId} not found`);
        }
        return event;
    }

    private createUniqueToken(): { token: string; tokenHash: string } {
        const token = generateGuestToken();
        return { token, tokenHash: hashGuestToken(token) };
    }
}
